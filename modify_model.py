"""Rebuild the supplied GLB as a PC-controlled, two-cuvette teaching instrument.

No network or modeling package is needed: this script appends ordinary glTF mesh
accessors to the binary chunk and disconnects obsolete nodes from the scene.
"""
from __future__ import annotations

import json
import math
import struct
from pathlib import Path

SOURCE = Path(__file__).with_name("spectrophotometer-original.glb")
DESTINATION = Path(__file__).with_name("spectrophotometer.glb")


def read_glb(path: Path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", data)
    assert magic == 0x46546C67 and version == 2 and length == len(data)
    offset = 12
    json_length, json_type = struct.unpack_from("<II", data, offset)
    assert json_type == 0x4E4F534A
    offset += 8
    document = json.loads(data[offset:offset + json_length])
    offset += json_length
    binary_length, binary_type = struct.unpack_from("<II", data, offset)
    assert binary_type == 0x004E4942
    return document, bytearray(data[offset + 8:offset + 8 + binary_length])


doc, binary = read_glb(SOURCE)
nodes = doc["nodes"]
assert nodes[2]["name"] == "GLTF_SceneRootNode"
assert nodes[53]["name"] == "CuvetteCarousel"

# The original screen and three physical keys are separate nodes. Detach the
# screen module and all obsolete controls; the new plate masks the textured
# keypad printed on the old shell underneath.
nodes[13]["children"].remove(22)
for index in (58, 61, 64, 67):
    nodes[2]["children"].remove(index)
nodes[37]["children"].remove(45)  # original third glass cuvette
nodes[37]["children"].remove(38)  # original three-bay rack
nodes[37]["children"].remove(39)  # bolts distributed across that rack
# The sample now occupies the original red/front position, and the blank the
# original gray/back position. The carriage's two travel endpoints must also
# exchange so the requested cell still reaches the fixed optical beam.
nodes[41]["matrix"][14] += .043
nodes[43]["matrix"][14] -= .043
nodes[56]["translation"][2] = 0
nodes[57]["translation"][2] = -.043
nodes[53]["translation"][2] = -.063
nodes[57]["scale"] = [.02, .0001, .019]
nodes[57]["translation"] = [-.001, -.016, -.043]
for entry in doc["materials"]:
    if entry["name"] == "SampleLiquid":
        entry["pbrMetallicRoughness"]["baseColorFactor"] = [.54, .62, .67, 0]
    elif entry["name"] in ("SpectrometerMain", "LidShellCutaway"):
        entry["pbrMetallicRoughness"]["baseColorFactor"] = [.58, .60, .60, 1]
    elif entry["name"] == "SpectrometerMain.001":
        entry["pbrMetallicRoughness"]["baseColorFactor"] = [.73, .79, .80, 1]
for animation in doc["animations"]:
    animation["channels"] = [channel for channel in animation["channels"]
                             if channel["target"]["node"] not in (58, 61, 64, 67)]


def swap_carousel_positions():
    for animation in doc["animations"]:
        for channel in animation["channels"]:
            if channel["target"] != {"node": 53, "path": "translation"}:
                continue
            output = animation["samplers"][channel["sampler"]]["output"]
            accessor = doc["accessors"][output]
            view = doc["bufferViews"][accessor["bufferView"]]
            assert accessor["type"] == "VEC3" and accessor["componentType"] == 5126
            offset = view["byteOffset"] + accessor.get("byteOffset", 0)
            stride = view.get("byteStride", 12)
            for i in range(accessor["count"]):
                at = offset + i * stride + 8
                old_z = struct.unpack_from("<f", binary, at)[0]
                struct.pack_into("<f", binary, at, -.169 - old_z)
            if "min" in accessor and "max" in accessor:
                old_min, old_max = accessor["min"][2], accessor["max"][2]
                accessor["min"][2] = -.169 - old_max
                accessor["max"][2] = -.169 - old_min


swap_carousel_positions()


def material(name, rgba, *, metallic=0.05, roughness=0.66):
    entry = {
        "name": name,
        "doubleSided": True,
        "pbrMetallicRoughness": {
            "baseColorFactor": list(rgba),
            "metallicFactor": metallic,
            "roughnessFactor": roughness,
        },
    }
    if rgba[3] < 1:
        entry["alphaMode"] = "BLEND"
    doc["materials"].append(entry)
    return len(doc["materials"]) - 1


shell = material("PCLinkPanel", (.92, .96, .95, 1))
trim = material("PCLinkTrim", (.12, .33, .46, 1), metallic=.28)
lid_inner = material("PhotoLidInner", (.047, .075, .086, 1), roughness=.78)
lid_rim = material("PhotoLidRim", (.87, .93, .93, 1), roughness=.52)
holder_black = material("PhotoTwoCellHolder", (.065, .092, .104, 1), roughness=.73)
cable_pieces = [material(f"PCDataCable{i:02}", (.048, .115, .16, 0), roughness=.85)
                for i in range(10)]
red = material("BlankCuvetteRedMarker", (.83, .16, .19, 1))
gray = material("SampleCuvetteGrayMarker", (.31, .42, .48, 1))
mono = material("MonochromatorHousing", (.13, .27, .39, 1), metallic=.35, roughness=.38)
slit = material("MonochromatorSlit", (.36, .79, .93, 1), metallic=.18, roughness=.24)


def append_accessor(values, width, component_type, minimum=None, maximum=None):
    while len(binary) % 4:
        binary.append(0)
    offset = len(binary)
    fmt = "f" if component_type == 5126 else "I"
    flat = [value for row in values for value in row]
    binary.extend(struct.pack("<" + fmt * len(flat), *flat))
    doc["bufferViews"].append({
        "buffer": 0, "byteOffset": offset,
        "byteLength": len(binary) - offset,
        "target": 34962 if component_type == 5126 else 34963,
    })
    accessor = {
        "bufferView": len(doc["bufferViews"]) - 1,
        "componentType": component_type,
        "count": len(values),
        "type": {1: "SCALAR", 3: "VEC3", 4: "VEC4"}[width],
    }
    if minimum is not None:
        accessor["min"] = minimum
        accessor["max"] = maximum
    doc["accessors"].append(accessor)
    return len(doc["accessors"]) - 1


def add_mesh(name, vertices, faces, mat, parent=2):
    vertices = [tuple(v) for v in vertices]
    normals = [[0., 0., 0.] for _ in vertices]
    for i, j, k in faces:
        u = [vertices[j][a] - vertices[i][a] for a in range(3)]
        v = [vertices[k][a] - vertices[i][a] for a in range(3)]
        n = [u[1] * v[2] - u[2] * v[1],
             u[2] * v[0] - u[0] * v[2],
             u[0] * v[1] - u[1] * v[0]]
        for z in (i, j, k):
            for a in range(3):
                normals[z][a] += n[a]
    for normal in normals:
        length = math.sqrt(sum(x * x for x in normal)) or 1
        normal[:] = [x / length for x in normal]
    xyz = append_accessor(vertices, 3, 5126,
                          [min(v[a] for v in vertices) for a in range(3)],
                          [max(v[a] for v in vertices) for a in range(3)])
    nor = append_accessor(normals, 3, 5126)
    indices = append_accessor([(i,) for face in faces for i in face], 1, 5125)
    doc["meshes"].append({"name": name, "primitives": [{
        "attributes": {"POSITION": xyz, "NORMAL": nor},
        "indices": indices, "material": mat,
    }]})
    doc["nodes"].append({"name": name, "mesh": len(doc["meshes"]) - 1})
    nodes[parent].setdefault("children", []).append(len(nodes) - 1)


def top(z, elevation=0):
    # Plane follows the original slanted blue top, viewed from the operator.
    return .226 + .195 * z + elevation


def sloped_plate(name, xmin, xmax, zmin, zmax, elevation, mat):
    vertices = [(xmin, top(zmin, elevation), zmin),
                (xmax, top(zmin, elevation), zmin),
                (xmax, top(zmax, elevation), zmax),
                (xmin, top(zmax, elevation), zmax)]
    add_mesh(name, vertices, [(0, 1, 2), (0, 2, 3)], mat)


# The removed module was a raised housing. Close its sides, not only the top:
# otherwise the old cavity can be seen when the model is rotated.
top_vertices = [(x, top(z, .004), z) for x,z in
                ((-.390,-.177),(-.200,-.177),(-.200,.030),(-.390,.030))]
bottom_vertices = [(x, .171, z) for x,z in
                   ((-.390,-.177),(-.200,-.177),(-.200,.030),(-.390,.030))]
faces = [(0,1,2),(0,2,3),(4,6,5),(4,7,6)]
for i in range(4):
    j=(i+1)%4
    faces.extend(((i,j,4+j),(i,4+j,4+i)))
add_mesh("CleanComputerControlledDeck", top_vertices+bottom_vertices, faces, shell)
# A fine blue line and connector mark identify the computer-linked unit.
sloped_plate("DeckInsetStripe", -.383, -.207, -.166, -.161, .006, trim)
sloped_plate("DeckConnectionMark", -.377, -.349, -.149, -.143, .007, trim)


def box(name, center, size, mat, parent=2):
    x, y, z = center
    a, b, c = (v / 2 for v in size)
    vertices = [(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
                (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
    faces = [(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),
             (1,2,6),(1,6,5),(2,3,7),(2,7,6),(3,0,4),(3,4,7)]
    add_mesh(name, vertices, faces, mat, parent)


# The reference instrument has a tall white hinged cover with a black insert
# facing the operator when open. Parent every new cover feature to LidHinge so
# it follows the existing animation and disappears under the lid when closed.
box("RaisedLidDarkInset", (-.005, .074, -.0171), (.119, .153, .002), lid_inner, 52)
for name, center, size in (
    ("Top", (-.005, .154, -.0185), (.132, .009, .006)),
    ("Bottom", (-.005, -.006, -.0185), (.132, .009, .006)),
    ("Left", (-.070, .074, -.0185), (.009, .153, .006)),
    ("Right", (.060, .074, -.0185), (.009, .153, .006)),
):
    box("RaisedLid" + name + "WhiteRim", center, size, lid_rim, 52)

# The right sloping shoulder stays a clean PC-controlled instrument deck:
# its slim inlaid stripe echoes the reference housing without creating a
# misleading second display or unused physical keys.
sloped_plate("ReferenceShoulderInset", -.367, -.216, -.112, -.105, .007, trim)
sloped_plate("ReferenceShoulderEdge", -.393, -.198, .020, .023, .006, lid_rim)

# A compact, labelled optical stage sits between the original lamp and the
# two-cell compartment. The bright narrow window marks the selected beam.
box("MonochromatorHousingVisible", (-.047, .127, -.102), (.020, .027, .021), mono)
box("MonochromatorSelectedWavelengthSlit", (-.058, .127, -.102), (.002, .015, .009), slit)
box("MonochromatorTopIndicator", (-.047, .141, -.102), (.013, .002, .013), slit)


# Replace the third-bay cassette with an actual two-slot frame. The tray is
# parented to the moving carriage, so it stays registered with both cuvettes.
box("TwoCellTrayFloor", (0, -.033, -.0215), (.090, .005, .095), trim, 53)
for name, z in (("Blank", 0), ("Sample", -.043)):
    box("TwoCell" + name + "BlackSeat", (0, -.021, z), (.055, .014, .039), holder_black, 53)
for side, x in (("Left", -.046), ("Right", .046)):
    box("TwoCell" + side + "Rail", (x, -.022, -.0215), (.006, .023, .094), trim, 53)
for name, z in (("Front", -.067), ("Divider", -.0215), ("Back", .024)):
    box("TwoCell" + name + "Crossbar", (0, -.020, z), (.096, .012, .005), trim, 53)
# Markers move with their corresponding lifted glass cells. The solvent in the
# red blank stays clear; red/gray identify the holder, not the sample liquid.
for name, z, mat, parent in (("BlankRed", 0, red, 54),
                              ("SampleGray", -.043, gray, 55)):
    for side, dx in (("L", -.021), ("R", .021)):
        box(name + side, (dx, .0215, z), (.0035, .0036, .034), mat, parent)
    for side, dz in (("Front", -.018), ("Back", .018)):
        box(name + side, (0, .0215, z + dz), (.043, .0036, .0035), mat, parent)


def tube(name, controls, radius, mat, segments=32, sides=7):
    def point(t):
        a,b,c,d = controls
        return tuple((1-t)**3*a[q] + 3*(1-t)**2*t*b[q] +
                     3*(1-t)*t*t*c[q] + t**3*d[q] for q in range(3))
    vertices=[]
    for i in range(segments+1):
        t=i/segments
        p=point(t)
        prev=point(max(0, t-.001)); nxt=point(min(1, t+.001))
        tangent=[nxt[q]-prev[q] for q in range(3)]
        length=math.sqrt(sum(x*x for x in tangent)) or 1
        tangent=[x/length for x in tangent]
        ref=(0,0,1) if abs(tangent[2])<.85 else (0,1,0)
        side=[tangent[1]*ref[2]-tangent[2]*ref[1],
              tangent[2]*ref[0]-tangent[0]*ref[2],
              tangent[0]*ref[1]-tangent[1]*ref[0]]
        length=math.sqrt(sum(x*x for x in side)) or 1
        side=[x/length for x in side]
        up=[tangent[1]*side[2]-tangent[2]*side[1],
            tangent[2]*side[0]-tangent[0]*side[2],
            tangent[0]*side[1]-tangent[1]*side[0]]
        for k in range(sides):
            a=2*math.pi*k/sides
            vertices.append(tuple(p[q]+radius*(math.cos(a)*side[q]+math.sin(a)*up[q]) for q in range(3)))
    faces=[]
    for i in range(segments):
        for k in range(sides):
            a=i*sides+k; b=i*sides+(k+1)%sides
            c=(i+1)*sides+k; d=(i+1)*sides+(k+1)%sides
            faces.extend(((a,b,c),(b,d,c)))
    add_mesh(name,vertices,faces,mat)


# The original rear connector remains part of the supplied model at
# (-.332, .036, +.109). The detachable plug meets that connector from behind,
# then the cable arcs behind the housing toward the adjacent computer.
box("RearDataPlug", (-.332, .036, .124), (.022, .014, .027), cable_pieces[0])
# In the operator view the computer is on screen right (negative model X).
# Route behind the chassis and out through that side of the 3D viewer.
control = [(-.332,.036,.138),(-.36,.044,.24),(-.60,.031,.30),(-.73,.068,.13)]
def bezier(t):
    a,b,c,d = control
    return tuple((1-t)**3*a[q]+3*(1-t)**2*t*b[q]+3*(1-t)*t*t*c[q]+t**3*d[q]
                 for q in range(3))
def derivative(t):
    a,b,c,d = control
    return tuple(3*(1-t)**2*(b[q]-a[q])+6*(1-t)*t*(c[q]-b[q])+3*t*t*(d[q]-c[q])
                 for q in range(3))
for index, mat in enumerate(cable_pieces):
    start, end = index/len(cable_pieces), (index+1)/len(cable_pieces)
    a,b,da,db = bezier(start),bezier(end),derivative(start),derivative(end)
    step = (end-start)/3
    segment = [a,tuple(a[q]+step*da[q] for q in range(3)),
               tuple(b[q]-step*db[q] for q in range(3)),b]
    tube(f"CableBehindToComputer{index:02}", segment, .0033, mat, segments=6, sides=8)

def last_accessor_value(index):
    accessor = doc["accessors"][index]
    view = doc["bufferViews"][accessor["bufferView"]]
    width = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[accessor["type"]]
    assert accessor["componentType"] == 5126 and "byteStride" not in view
    offset = view["byteOffset"] + accessor.get("byteOffset", 0) + (accessor["count"] - 1) * width * 4
    return struct.unpack_from("<" + "f" * width, binary, offset)


# model-viewer changes animation actions between operations. Give every clip a
# final, filled sample core so switching clips cannot restore the tiny default
# liquid after the fill has completed. The material stays transparent until a
# solution is actually chosen in the UI.
for animation in doc["animations"]:
    duration = max(last_accessor_value(sampler["input"])[0] for sampler in animation["samplers"])
    stationary_time = append_accessor([(0.,), (duration,)], 1, 5126, [0.], [duration])
    for path, values in (("scale", [(.02,.024,.019)] * 2),
                         ("translation", [(-.001,-.004,-.043)] * 2)):
        output = append_accessor(values, 3, 5126)
        animation["samplers"].append({"input": stationary_time, "output": output, "interpolation": "LINEAR"})
        animation["channels"].append({"sampler": len(animation["samplers"])-1,
                                      "target": {"node": 57, "path": path}})

fill_time = append_accessor([(0.,), (.25,), (1.4,)], 1, 5126, [0.], [1.4])
fill_scale = append_accessor([(.02,.0001,.019), (.02,.002,.019), (.02,.024,.019)], 3, 5126)
fill_position = append_accessor([(-.001,-.016,-.043), (-.001,-.014,-.043), (-.001,-.004,-.043)], 3, 5126)
for cell in ("off", "blank", "sample"):
    # Static tracks retain the exact open lid, carousel, lift and beam pose
    # while the liquid rises. This avoids the lid snapping when a new clip starts.
    reference = next(a for a in doc["animations"] if a["name"] == "Lid open " + cell)
    fill = {"name": "Fill sample " + cell, "samplers": [], "channels": []}
    static_time = append_accessor([(0.,), (1.4,)], 1, 5126, [0.], [1.4])
    for channel in reference["channels"]:
        if channel["target"]["node"] == 57:
            continue
        original = reference["samplers"][channel["sampler"]]
        final_value = last_accessor_value(original["output"])
        output = append_accessor([final_value, final_value], len(final_value), 5126)
        fill["samplers"].append({"input": static_time, "output": output, "interpolation": "LINEAR"})
        fill["channels"].append({"sampler": len(fill["samplers"])-1,
                                 "target": dict(channel["target"])})
    for path, output in (("scale", fill_scale), ("translation", fill_position)):
        fill["samplers"].append({"input": fill_time, "output": output, "interpolation": "LINEAR"})
        fill["channels"].append({"sampler": len(fill["samplers"])-1,
                                 "target": {"node": 57, "path": path}})
    doc["animations"].append(fill)

# A static pose for every reachable state lets the web viewer settle all moving
# nodes after a clip or camera-mode change. A one-shot animation can otherwise
# leave its final frame stale when the next action is selected asynchronously.
for cell in ("off", "blank", "sample"):
    for lid in ("open", "closed"):
        reference_name = f"Lid {'open' if lid == 'open' else 'close'} {cell}"
        reference = next(a for a in doc["animations"] if a["name"] == reference_name)
        pose = {"name": f"Pose {cell} {lid}", "samplers": [], "channels": []}
        pose_time = append_accessor([(0.,), (.05,)], 1, 5126, [0.], [.05])
        for channel in reference["channels"]:
            original = reference["samplers"][channel["sampler"]]
            final_value = last_accessor_value(original["output"])
            output = append_accessor([final_value, final_value], len(final_value), 5126)
            pose["samplers"].append({"input": pose_time, "output": output, "interpolation": "LINEAR"})
            pose["channels"].append({"sampler": len(pose["samplers"]) - 1,
                                     "target": dict(channel["target"])})
        doc["animations"].append(pose)

# Prune detached screen, old buttons, and the third cuvette from the graph.
# This also leaves only two cuvettes when the final GLB is inspected directly.
reachable = set()
def visit(index):
    if index in reachable:
        return
    reachable.add(index)
    for child in doc["nodes"][index].get("children", []):
        visit(child)
for scene in doc["scenes"]:
    for root in scene["nodes"]:
        visit(root)
node_indices = sorted(reachable)
node_map = {old: new for new, old in enumerate(node_indices)}
doc["nodes"] = [doc["nodes"][i] for i in node_indices]
for node in doc["nodes"]:
    if "children" in node:
        node["children"] = [node_map[i] for i in node["children"]]
for scene in doc["scenes"]:
    scene["nodes"] = [node_map[i] for i in scene["nodes"]]
for animation in doc["animations"]:
    animation["channels"] = [channel for channel in animation["channels"]
                             if channel["target"]["node"] in node_map]
    for channel in animation["channels"]:
        channel["target"]["node"] = node_map[channel["target"]["node"]]

mesh_indices = sorted({node["mesh"] for node in doc["nodes"] if "mesh" in node})
mesh_map = {old: new for new, old in enumerate(mesh_indices)}
doc["meshes"] = [doc["meshes"][i] for i in mesh_indices]
for node in doc["nodes"]:
    if "mesh" in node:
        node["mesh"] = mesh_map[node["mesh"]]
material_indices = sorted({primitive["material"] for mesh in doc["meshes"]
                           for primitive in mesh["primitives"] if "material" in primitive})
material_map = {old: new for new, old in enumerate(material_indices)}
doc["materials"] = [doc["materials"][i] for i in material_indices]
for mesh in doc["meshes"]:
    for primitive in mesh["primitives"]:
        if "material" in primitive:
            primitive["material"] = material_map[primitive["material"]]

doc["buffers"][0]["byteLength"] = len(binary)
json_chunk = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
json_chunk += b" " * (-len(json_chunk) % 4)
binary += b"\0" * (-len(binary) % 4)
header = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(json_chunk) + 8 + len(binary))
DESTINATION.write_bytes(header + struct.pack("<II", len(json_chunk), 0x4E4F534A) + json_chunk +
                        struct.pack("<II", len(binary), 0x004E4942) + binary)
print(f"Wrote {DESTINATION.name}: {len(doc['nodes'])} visible nodes, {len(doc['meshes'])} meshes")
