"""Build a lightweight teaching model inspired by the photographed Cary 100.

The geometry is original and intentionally simplified: a wide white chassis,
rear vent module, two cuvette positions in a front-to-back row (blank at the
rear, sample at the front), a hinged dark sample cover and a rear computer
connector.  No modelling package or build server is required.
"""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path

OUT = Path(__file__).with_name("spectrophotometer.glb")
doc = {
    "asset": {"version": "2.0", "generator": "UV-Vis Lab Cary-style teaching model"},
    "scene": 0,
    "scenes": [{"nodes": [0]}],
    "nodes": [{"name": "Instrument", "children": []}],
    "materials": [], "meshes": [], "accessors": [], "bufferViews": [],
    "buffers": [{"byteLength": 0}], "animations": [],
}
binary = bytearray()


def material(name, color, roughness=.75, metallic=0, alpha=False, emissive=None):
    item = {"name": name, "doubleSided": alpha,
            "pbrMetallicRoughness": {"baseColorFactor": list(color),
                                     "roughnessFactor": roughness,
                                     "metallicFactor": metallic}}
    if alpha:
        item["alphaMode"] = "BLEND"
    if emissive:
        item["emissiveFactor"] = list(emissive)
    doc["materials"].append(item)
    return len(doc["materials"]) - 1


white = material("PorcelainWhite", (.75, .80, .80, 1), .75)
top = material("WarmWhiteTop", (.86, .89, .86, 1), .78)
edge = material("SeamWhite", (.68, .74, .75, 1), .68)
base = material("LowerGraphite", (.18, .21, .23, 1), .79)
cover = material("GraphiteCover", (.15, .17, .19, 1), .67)
cover_top = material("CoverInset", (.11, .13, .15, 1), .83)
vent = material("VentPanel", (.19, .22, .24, 1), .86)
vent_slot = material("VentSlots", (.075, .092, .103, 1), .88)
well = material("SampleWell", (.062, .075, .085, 1), .91)
steel = material("HingeSteel", (.46, .50, .51, 1), .41, .32)
red = material("BlankHolderRed", (.65, .16, .18, 1), .69)
gray = material("SampleHolderGray", (.31, .38, .42, 1), .72)
glass = material("CuvetteGlass", (.78, .91, .94, .36), .13, alpha=True)
blank_liquid = material("BlankLiquid", (.78, .94, .96, .42), .2, alpha=True)
sample_liquid = material("SampleLiquid", (.64, .77, .80, .72), .19, alpha=True)
lamp = material("LampHousing", (.28, .38, .43, 1), .48, .22)
light = material("LightWindow", (.20, .31, .35, 1), .24, emissive=(0, 0, 0))
source_glow = material("SourceGlow", (.18, .28, .33, 1), .2, emissive=(0, 0, 0))
beam_ref = material("ReferenceBeam", (.39, .83, .98, 0), .2, alpha=True, emissive=(.14, .37, .45))
beam_sample = material("SampleBeam", (1, .68, .29, 0), .2, alpha=True, emissive=(.45, .24, .06))
# A short white segment exists before the monochromator. The two rays after it
# always share the selected wavelength, including through both cuvettes.
incident = material("IncidentWhiteBeam", (.96, .98, 1, 0), .1, alpha=True, emissive=(.75, .79, .85))
def glow(name, c, a=0):
    return material(name, (*c, a), .2, alpha=True, emissive=c)
# Cahaya dibuat berlapis seperti di foto acuan: inti tipis yang terang + halo lembut di sekelilingnya.
halo_ref, halo_samp = glow("ReferenceGlow", (.5, .4, 1)), glow("SampleGlow", (.5, .4, 1))
inc_glow = glow("IncidentGlow", (.8, .8, 1))
bulb_core, bulb_halo = glow("SourceBulb", (.7, .6, 1)), glow("SourceHalo", (.6, .5, 1))
pulse_ref, pulse_samp = glow("PulseRef", (1, 1, 1)), glow("PulseSample", (1, 1, 1))
BANDS = [("Violet", (.56, .12, 1)), ("Indigo", (.30, .10, .95)), ("Blue", (.10, .45, 1)),
         ("Green", (.12, .90, .25)), ("Yellow", (1, .92, .10)), ("Orange", (1, .50, .05)), ("Red", (1, .10, .08))]
band_mats = [glow("Band" + n, c) for n, c in BANDS]
sel_core, sel_glow = glow("SelectedBeam", (.5, .4, 1)), glow("SelectedGlow", (.5, .4, 1))
prism_glass = material("MonoPrismGlass", (.10, .12, .15, 0), .55, alpha=True)   # abu-abu pekat, kasar agar pantulan tidak memucatkan
splitter_glass = material("SplitterGlass", (.70, .86, 1, 0), .08, alpha=True)
lens_glass = material("LensGlass", (.74, .90, 1, 0), .05, alpha=True)
slit_black = material("SlitBlack", (.02, .023, .027, 1), .42, .35)   # pelat celah: hitam pekat agar jelas terlihat
slit_rim = material("SlitRim", (.60, .67, .70, 1), .3, .6)           # tepi terang di bibir celah
mono_housing = material("MonoHousing", (.28, .38, .43, 1), .48, .22)   # tampak sama seperti sebelumnya; app.js membuatnya bening saat scan
power_led = material("PowerLED", (.22, .35, .33, 1), .38, emissive=(0, 0, 0))
print_ink = material("FrontPrint", (.25, .32, .35, 1), .9)


def accessor(rows, width, comp, target=None):
    while len(binary) % 4:
        binary.append(0)
    offset = len(binary)
    fmt = "f" if comp == 5126 else "I"
    values = [value for row in rows for value in row]
    binary.extend(struct.pack("<" + fmt * len(values), *values))
    view = {"buffer": 0, "byteOffset": offset, "byteLength": len(binary) - offset}
    if target:
        view["target"] = target
    doc["bufferViews"].append(view)
    entry = {"bufferView": len(doc["bufferViews"]) - 1, "componentType": comp,
             "count": len(rows), "type": {1: "SCALAR", 3: "VEC3", 4: "VEC4"}[width]}
    if width == 3 and comp == 5126:
        entry["min"] = [min(row[i] for row in rows) for i in range(3)]
        entry["max"] = [max(row[i] for row in rows) for i in range(3)]
    doc["accessors"].append(entry)
    return len(doc["accessors"]) - 1


def mesh(name, vertices, normals, triangles, mat, parent=0):
    assert len(vertices) == len(normals)
    # Front is -Z. Mirroring X keeps the vent and power switch on the
    # viewer's left when the camera looks at the operator-facing side.
    vertices = [(-x, y, z) for x, y, z in vertices]
    normals = [(-x, y, z) for x, y, z in normals]
    triangles = [(a, c, b) for a, b, c in triangles]
    xyz = accessor(vertices, 3, 5126, 34962)
    nor = accessor(normals, 3, 5126, 34962)
    idx = accessor([(index,) for triangle in triangles for index in triangle], 1, 5125, 34963)
    doc["meshes"].append({"name": name, "primitives": [{"attributes": {
        "POSITION": xyz, "NORMAL": nor}, "indices": idx, "material": mat}]})
    doc["nodes"].append({"name": name, "mesh": len(doc["meshes"]) - 1})
    doc["nodes"][parent].setdefault("children", []).append(len(doc["nodes"]) - 1)
    return len(doc["nodes"]) - 1


def rounded_box(name, center, size, radius, mat, parent=0):
    """Softly rounded rectangular housing with true vertex normals."""
    half = [s / 2 for s in size]
    radius = min(radius, min(half) * .8)
    coords = [[-h, -h + radius, h - radius, h] for h in half]
    vertices, normals, triangles = [], [], []
    for axis in range(3):
        other = [i for i in range(3) if i != axis]
        for sign in (-1, 1):
            start = len(vertices)
            for u in coords[other[0]]:
                for v in coords[other[1]]:
                    q = [0., 0., 0.]
                    q[axis] = sign * half[axis]
                    q[other[0]], q[other[1]] = u, v
                    core = [max(-half[i] + radius, min(half[i] - radius, q[i])) for i in range(3)]
                    delta = [q[i] - core[i] for i in range(3)]
                    length = math.sqrt(sum(d * d for d in delta)) or 1
                    normal = [d / length for d in delta]
                    vertices.append(tuple(center[i] + core[i] + radius * normal[i] for i in range(3)))
                    normals.append(tuple(normal))
            for i in range(3):
                for j in range(3):
                    a = start + i * 4 + j
                    b, c, d = a + 4, a + 5, a + 1
                    # The two projected axes can reverse triangle winding.
                    pu = [vertices[b][k] - vertices[a][k] for k in range(3)]
                    pv = [vertices[d][k] - vertices[a][k] for k in range(3)]
                    cross = (pu[1] * pv[2] - pu[2] * pv[1],
                             pu[2] * pv[0] - pu[0] * pv[2],
                             pu[0] * pv[1] - pu[1] * pv[0])
                    if cross[axis] * sign > 0:
                        triangles.extend(((a, b, c), (a, c, d)))
                    else:
                        triangles.extend(((a, c, b), (a, d, c)))
    return mesh(name, vertices, normals, triangles, mat, parent)


def rod(name, a, b, radius, mat, sides=10, parent=0):
    direction = [b[i] - a[i] for i in range(3)]
    length = math.sqrt(sum(d * d for d in direction)) or 1
    axis = [d / length for d in direction]
    ref = (0, 1, 0) if abs(axis[1]) < .85 else (1, 0, 0)
    side = [axis[1] * ref[2] - axis[2] * ref[1],
            axis[2] * ref[0] - axis[0] * ref[2],
            axis[0] * ref[1] - axis[1] * ref[0]]
    norm = math.sqrt(sum(s * s for s in side)) or 1
    side = [s / norm for s in side]
    up = [axis[1] * side[2] - axis[2] * side[1],
          axis[2] * side[0] - axis[0] * side[2],
          axis[0] * side[1] - axis[1] * side[0]]
    vertices, normals, faces = [], [], []
    for p in (a, b):
        for j in range(sides):
            angle = 2 * math.pi * j / sides
            n = [math.cos(angle) * side[i] + math.sin(angle) * up[i] for i in range(3)]
            vertices.append(tuple(p[i] + radius * n[i] for i in range(3)))
            normals.append(tuple(n))
    for j in range(sides):
        k = (j + 1) % sides
        faces.extend(((j, k, sides + j), (k, sides + k, sides + j)))
    return mesh(name, vertices, normals, faces, mat, parent)


def quad(name, points, mat):
    a, b, c = points[:3]
    u = [b[i] - a[i] for i in range(3)]
    v = [c[i] - a[i] for i in range(3)]
    cross = (u[1] * v[2] - u[2] * v[1],
             u[2] * v[0] - u[0] * v[2],
             u[0] * v[1] - u[1] * v[0])
    n = math.sqrt(sum(x*x for x in cross)) or 1
    normal = tuple(x / n for x in cross)
    return mesh(name, points, [normal] * 4, [(0, 1, 2), (0, 2, 3)], mat)


# Low, wide chassis and the raised optics housing on its left rear.
rounded_box("DarkBase", (0, .025, 0), (1.12, .05, .78), .014, base)
rounded_box("MainWhiteBody", (0, .120, -.014), (1.10, .19, .75), .028, white)
rounded_box("FrontApron", (0, .145, -.378), (1.08, .155, .045), .015, top)
rounded_box("LeftTopDeck", (-.30, .230, -.026), (.48, .038, .70), .019, top)
rounded_box("RightTopDeck", (.449, .230, -.026), (.19, .038, .70), .018, top)
rounded_box("WellFrontLip", (.165, .230, -.316), (.37, .038, .125), .010, top)
rounded_box("WellRearLip", (.165, .230, .240), (.37, .038, .170), .010, top)
rounded_box("RaisedOpticsWhite", (-.294, .303, .198), (.465, .150, .316), .021, top)
rounded_box("RearRightShoulder", (.196, .263, .247), (.488, .088, .217), .020, top)
quad("SlopingGraphiteVent", [(-.494, .383, -.002), (-.494, .414, .283),
                              (-.095, .414, .283), (-.095, .383, -.002)], vent)
for i in range(13):
    x = -.463 + i * .028
    for j in range(3):
        z = .122 + j * .041
        rounded_box(f"VentSlot{i}_{j}", (x, .386 + (.031/.285) * (z + .002), z),
                    (.017, .0015, .023), .001, vent_slot)

# Sample well with the two cuvettes in ONE front-to-back row: the blank
# (red holder, aquades) sits at the rear (+Z) and the sample (grey holder) at the
# front (-Z).  Light crosses the well sideways (along X) as two parallel beams,
# one through each cuvette, from the monochromator on one wall to the detector
# on the opposite wall.  No third rack.
CUV_X = .166
BLANK_Z, SAMPLE_Z = .053, -.107          # rear / front cuvette centres
MID_Z = (BLANK_Z + SAMPLE_Z) / 2         # lane divider and housings are centred here
BEAM_Y = .258
rounded_box("WellFloor", (.166, .202, -.027), (.36, .012, .40), .003, well)
for side, x in (("Left", -.012), ("Right", .344)):
    rounded_box("Well" + side + "Wall", (x, .231, -.027), (.012, .058, .40), .003, well)
for side, z in (("Front", -.22), ("Back", .166)):
    rounded_box("Well" + side + "Wall", (.166, .231, z), (.36, .058, .012), .003, well)
rounded_box("OpticalDivider", (.166, .213, MID_Z), (.32, .018, .013), .002, steel)
for label, z, holder_mat, liquid_mat in (("Blank", BLANK_Z, red, blank_liquid),
                                         ("Sample", SAMPLE_Z, gray, sample_liquid)):
    x = CUV_X
    rounded_box(label + "Holder", (x, .217, z), (.073, .023, .083), .006, holder_mat)
    rounded_box(label + "GlassCuvette", (x, .254, z), (.057, .075, .057), .003, glass)
    rounded_box(label + "Liquid", (x, .247, z), (.047, .047, .047), .002, liquid_mat)
    for side, dx in (("L", -.028), ("R", .028)):
        rounded_box(label + "GlassEdge" + side, (x + dx, .260, z),
                    (.002, .072, .057), .001, glass)
def prism_mesh(name, tri, y0, y1, mat, parent=0, upright=False, axis=None):
    """Prisma segitiga. Default: segitiga pada bidang x-z, diekstrusi pada y (rebah).
    upright=True: segitiga pada bidang x-y (puncak ke atas), diekstrusi pada z dari y0 ke y1 (berdiri)."""
    verts, norms, faces = [], [], []
    axis = axis or ("z" if upright else "y")
    # a,b = koordinat segitiga; c = sumbu ekstrusi. axis="x": segitiga pada bidang z-y, diekstrusi sepanjang x.
    def pt(a, b, c): return {"z": (a, b, c), "y": (a, c, b), "x": (c, b, a)}[axis]
    cx = sum(p[0] for p in tri) / 3; cz = sum(p[1] for p in tri) / 3; cy = (y0 + y1) / 2
    ctr = pt(cx, cz, cy)
    def face(pts, n):
        fc = [sum(p[i] for p in pts) / len(pts) for i in range(3)]
        if (fc[0]-ctr[0])*n[0] + (fc[1]-ctr[1])*n[1] + (fc[2]-ctr[2])*n[2] < 0: n = tuple(-v for v in n)
        b0 = len(verts)
        for p in pts: verts.append(p); norms.append(n)
        for k in range(1, len(pts) - 1): faces.append((b0, b0 + k, b0 + k + 1))
    face([pt(x, z, y1) for x, z in tri], pt(0, 0, 1))
    face([pt(x, z, y0) for x, z in tri], pt(0, 0, -1))
    for i in range(3):
        (x1, z1), (x2, z2) = tri[i], tri[(i + 1) % 3]
        L = math.hypot(x2 - x1, z2 - z1) or 1
        face([pt(x1, z1, y0), pt(x2, z2, y0), pt(x2, z2, y1), pt(x1, z1, y1)], pt((z2 - z1) / L, -(x2 - x1) / L, 0))
    return mesh(name, verts, norms, faces, mat, parent)

def sphere(name, ctr, r, mat, seg=16, rings=9):
    verts, norms, faces = [], [], []
    for i in range(rings + 1):
        ph = math.pi * i / rings
        for j in range(seg):
            th = 2 * math.pi * j / seg
            n = (math.sin(ph) * math.cos(th), math.cos(ph), math.sin(ph) * math.sin(th))
            verts.append(tuple(ctr[k] + r * n[k] for k in range(3))); norms.append(n)
    for i in range(rings):
        for j in range(seg):
            a = i * seg + j; b = i * seg + (j + 1) % seg
            c2 = (i + 1) * seg + j; d = (i + 1) * seg + (j + 1) % seg
            faces.extend(((a, c2, b), (b, c2, d)))
    return mesh(name, verts, norms, faces, mat)

# Source at the right, wavelength selector next, two cells in the middle and
# detector at the left, matching the visible operator-side teaching cutaway.
rounded_box("LightSource", (.324, .245, MID_Z), (.030, .057, .082), .006, lamp)
rounded_box("SourceWindow", (.308, BEAM_Y, MID_Z), (.003, .022, .029), .001, source_glow)
rounded_box("Monochromator", (.2665, .245, MID_Z), (.078, .056, .205), .006, mono_housing)   # diperlebar agar prisma, pelangi, dan celah muat berurutan
rounded_box("Detector", (.012, .245, MID_Z), (.030, .050, .215), .006, lamp)
for label, z in (("Blank", BLANK_Z), ("Sample", SAMPLE_Z)):
    rounded_box("OpticalSlit" + label, (.233, BEAM_Y, z), (.003, .014, .019), .001, light)
    rounded_box("DetectorWindow" + label, (.030, BEAM_Y, z), (.003, .014, .019), .001, steel)
for label, z, mat, halo, pulse in (("Reference", BLANK_Z, beam_ref, halo_ref, pulse_ref),
                                   ("Sample", SAMPLE_Z, beam_sample, halo_samp, pulse_samp)):
    rod(label + "SplitFromMonochromator", (.232, BEAM_Y, MID_Z), (.213, BEAM_Y, z), .0022, mat, 10)
    rod(label + "SplitHalo", (.232, BEAM_Y, MID_Z), (.213, BEAM_Y, z), .0065, halo, 10)
    rod(label + "BeamThroughCuvette", (.213, BEAM_Y, z), (.030, BEAM_Y, z), .0026, mat, 10)
    rod(label + "BeamHalo", (.213, BEAM_Y, z), (.030, BEAM_Y, z), .0085, halo, 12)
    rod(label + "Lens", (.199, BEAM_Y, z), (.203, BEAM_Y, z), .017, lens_glass, 24)   # lensa pemfokus sebelum kuvet
    sphere(label + "Pulse", (.213, BEAM_Y, z), .0055, pulse, 12, 7)                    # pulsa foton, digerakkan app.js

# Lampu di kanan: bola pijar kecil + halo, lalu berkas putih menuju prisma di dalam monokromator.
sphere("SourceBulbCore", (.306, BEAM_Y, MID_Z), .0085, bulb_core)
sphere("SourceBulbHalo", (.306, BEAM_Y, MID_Z), .015, bulb_halo)
# Susunan mengikuti diagram acuan (arah cahaya ke kiri): berkas putih -> PRISMA (segitiga sama sisi, puncak ke atas)
# -> pelangi melebar -> CELAH hitam -> satu berkas satu warna. Merah di atas, violet di bawah.
# Prisma berdiri seperti kuvet: sisi segitiganya (alas rata di bawah, puncak di atas) menghadap kotak slit hitam,
# memanjang sepanjang arah cahaya (sumbu x), bukan menghadap depan/belakang.
PRISM_X, PRISM_S, PRISM_LX = .284, .028, .007            # pusat x, sisi segitiga sama sisi, setengah panjang sepanjang x
PRISM_H = PRISM_S * math.sqrt(3) / 2
APEX_X, FAN_L, FAN_SPREAD = PRISM_X - PRISM_LX, .030, .022   # titik asal pelangi = tengah sisi kiri prisma
ENTRY_X = PRISM_X + PRISM_LX                              # titik masuk berkas putih = tengah sisi kanan prisma
rod("IncidentWhiteRay", (.307, BEAM_Y, MID_Z), (ENTRY_X, BEAM_Y, MID_Z), .0032, incident, 12)
rod("IncidentGlowRay", (.307, BEAM_Y, MID_Z), (ENTRY_X, BEAM_Y, MID_Z), .0095, inc_glow, 12)
prism_mesh("MonoPrism", [(MID_Z - PRISM_S / 2, BEAM_Y - PRISM_H / 2), (MID_Z + PRISM_S / 2, BEAM_Y - PRISM_H / 2),
                         (MID_Z, BEAM_Y + PRISM_H / 2)],
           PRISM_X - PRISM_LX, PRISM_X + PRISM_LX, prism_glass, axis="x")
rotor = len(doc["nodes"])
doc["nodes"].append({"name": "MonoRotor", "translation": [-APEX_X, BEAM_Y, MID_Z], "children": []})
doc["nodes"][0]["children"].append(rotor)
for i, (n, _c) in enumerate(BANDS):
    z0 = -FAN_SPREAD / 2 + i * FAN_SPREAD / 7
    prism_mesh("Band" + n, [(0, 0), (-FAN_L, z0), (-FAN_L, z0 + FAN_SPREAD / 7)], -.002, .002, band_mats[i], rotor)
# Celah keluar (slit): dua pelat hitam tinggi seperti pada diagram acuan, tepat sesudah pelangi.
# Hanya pita warna yang jatuh pada celah sempit di tengah yang lolos; pita lain terhalang pelat.
SLIT_T, SLIT_H, SLIT_LEN, GAP = .004, .050, .045, .00275
SLIT_X = APEX_X - FAN_L - .0005 - SLIT_T / 2
for sgn, nm in ((1, "Top"), (-1, "Bottom")):
    rounded_box("SlitPlate" + nm, (SLIT_X, .248, MID_Z + sgn * (GAP + SLIT_LEN / 2)), (SLIT_T, SLIT_H, SLIT_LEN), .0006, slit_black)
    rounded_box("SlitRim" + nm, (SLIT_X, .248, MID_Z + sgn * (GAP + .0004)), (SLIT_T + .0012, SLIT_H + .0012, .0008), .0003, slit_rim)
rod("SelectedBeam", (SLIT_X, BEAM_Y, MID_Z), (.232, BEAM_Y, MID_Z), .0026, sel_core, 10)
rod("SelectedGlow", (SLIT_X, BEAM_Y, MID_Z), (.232, BEAM_Y, MID_Z), .0085, sel_glow, 12)
# Pembagi berkas (pelat kaca 45 derajat) tepat di titik percabangan.
quad("BeamSplitter", [(.226, .243, MID_Z - .006), (.238, .243, MID_Z + .006),
                      (.238, .273, MID_Z + .006), (.226, .273, MID_Z - .006)], splitter_glass)

# The dark cover rotates from its rear hinge.  The animation drives one node,
# so repeated open/close actions cannot desynchronise separate pieces.
pivot = len(doc["nodes"])
doc["nodes"].append({"name": "SampleLidPivot", "translation": [-.166, .274, .171], "children": []})
doc["nodes"][0]["children"].append(pivot)
rounded_box("SampleLidOuter", (0, 0, -.185), (.367, .032, .383), .015, cover, pivot)
rounded_box("SampleLidInset", (0, .018, -.184), (.319, .003, .310), .009, cover_top, pivot)
rounded_box("SampleLidFrontFlap", (0, -.065, -.365), (.353, .117, .030), .010, cover, pivot)
rounded_box("SampleLidGrip", (0, .026, -.338), (.201, .016, .022), .006, vent_slot, pivot)
for x in (-.012, .344):
    rod("CoverHinge" + str(x), (x, .273, .175), (x + .027, .273, .175), .012, steel)

# A small real power control sits low at the front left as in the photo.
rounded_box("PowerRocker", (-.465, .052, -.413), (.082, .050, .018), .007, base)
rounded_box("PowerRockerFace", (-.465, .052, -.426), (.059, .034, .009), .004, cover)
rod("PowerLEDLens", (-.496, .078, -.430), (-.496, .078, -.439), .009, power_led)
rounded_box("FrontDataSocket", (.055, .036, -.414), (.090, .026, .009), .004, base)
for x in (-.38, -.345, -.31):
    rounded_box("FrontPrintedMark" + str(x), (x, .136, -.403), (.019, .0015, .001), .0005, print_ink)

# The data lead emerges from the rear connector, leaving rotation free.
rounded_box("RearPCPort", (.454, .105, .378), (.079, .042, .013), .004, base)
rounded_box("RearPCPlug", (.454, .105, .391), (.052, .031, .019), .004, steel)
control = [(.454, .105, .401), (.566, .095, .500), (.679, .041, .420), (.724, .045, .340)]
def bezier(t):
    a, b, c, d = control
    return tuple((1-t)**3*a[i] + 3*(1-t)**2*t*b[i] +
                 3*(1-t)*t*t*c[i] + t**3*d[i] for i in range(3))
for i in range(16):
    rod(f"CableSegment{i:02}", bezier(i/16), bezier((i+1)/16), .0045, base, 8)

# A single, manually scrubbed animation clip makes the lid reversible.
times = accessor([(0.,), (1.,), (2.,)], 1, 5126)
angle = 1.49
opened = (math.sin(angle/2), 0., 0., math.cos(angle/2))
quats = accessor([(0., 0., 0., 1.), opened, opened], 4, 5126)
doc["animations"].append({"name": "LidMotion",
                           "samplers": [{"input": times, "output": quats, "interpolation": "LINEAR"}],
                           "channels": [{"sampler": 0, "target": {"node": pivot, "path": "rotation"}}]})

doc["buffers"][0]["byteLength"] = len(binary)
json_bytes = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
json_bytes += b" " * (-len(json_bytes) % 4)
binary += b"\0" * (-len(binary) % 4)
header = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(json_bytes) + 8 + len(binary))
OUT.write_bytes(header + struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes +
                struct.pack("<II", len(binary), 0x004E4942) + binary)
print(f"{OUT.name}: {len(doc['nodes'])} nodes, {len(doc['meshes'])} meshes, {OUT.stat().st_size} bytes")
