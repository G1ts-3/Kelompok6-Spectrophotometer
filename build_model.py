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
condenser_glass = material("CondenserGlass", (.74, .90, 1, 0), .05, alpha=True)   # kondensor (lensa cembung) sebelum prisma
display_black = material("DetectorDisplayBlack", (.03, .032, .038, 1), .4, .2)
display_glow = glow("DetectorDisplayGlow", (1, .12, .08))                         # layar merah detektor (seperti diagram acuan)
slit_black = material("SlitBlack", (.02, .023, .027, 1), .42, .35)   # pelat celah: hitam pekat agar jelas terlihat
slit_rim = material("SlitRim", (.60, .67, .70, 1), .3, .6)           # tepi terang di bibir celah
mono_housing = material("MonoHousing", (.28, .38, .43, 1), .48, .22)   # tampak sama seperti sebelumnya; app.js membuatnya bening saat scan
power_led = material("PowerLED", (.22, .35, .33, 1), .38, emissive=(0, 0, 0))
mirror_mat = material("InternalMirror", (.55, .72, .82, 1), .12, .85)
internal_metal = material("InternalMetal", (.42, .46, .48, 1), .45, .55)
internal_dark = material("InternalDark", (.16, .19, .21, 1), .6, .3)
internal_pcb = material("InternalPCB", (.10, .38, .33, 1), .55)
internal_lamp = material("InternalLamp", (.95, .82, .45, 1), .3, emissive=(.25, .18, .05))
internal_ray = material("InternalRay", (.95, .12, .10, 1), .3, emissive=(.9, .08, .05))   # jalur merah seperti brosur Cary
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
MX = lambda x: 2 * CUV_X - x   # cermin terhadap tengah ruang kuvet: cahaya berjalan kiri -> kanan di layar
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
    # Keep the vessel and its liquid together while lifting/replacing it in JS.
    lift = len(doc["nodes"])
    doc["nodes"].append({"name": label + "CuvetteLift", "children": []})
    doc["nodes"][0]["children"].append(lift)
    rounded_box(label + "GlassCuvette", (x, .254, z), (.057, .075, .057), .003, glass, lift)
    rounded_box(label + "Liquid", (x, .247, z), (.047, .047, .047), .002, liquid_mat, lift)
    for side, dx in (("L", -.028), ("R", .028)):
        rounded_box(label + "GlassEdge" + side, (x + dx, .260, z),
                    (.002, .072, .057), .001, glass, lift)
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

def lens(name, cx, cy, cz, radius, t_center, t_edge, mat, seg=28, rings=6):
    """Lensa cembung-ganda (sumbu optik sepanjang x), dibuat dengan memutar profil lengkung."""
    verts = []
    for side in (-1, 1):
        for i in range(rings + 1):
            r = radius * i / rings
            h = t_edge / 2 + (t_center - t_edge) / 2 * (1 - (r / radius) ** 2)
            for j in range(seg):
                a = 2 * math.pi * j / seg
                verts.append((cx + side * h, cy + r * math.cos(a), cz + r * math.sin(a)))
    norms = []
    for v in verts:
        d = [v[k] - (cx, cy, cz)[k] for k in range(3)]
        n = math.sqrt(sum(x * x for x in d)) or 1
        norms.append(tuple(x / n for x in d))
    faces, back = [], (rings + 1) * seg
    for base in (0, back):
        for i in range(rings):
            for j in range(seg):
                k = (j + 1) % seg
                a, b = base + i * seg + j, base + i * seg + k
                c, d = base + (i + 1) * seg + j, base + (i + 1) * seg + k
                faces.extend(((a, c, b), (b, c, d)))
    for j in range(seg):                    # tepi lensa menghubungkan permukaan depan dan belakang
        k = (j + 1) % seg
        a, b = rings * seg + j, rings * seg + k
        faces.extend(((a, a + back, b), (b, a + back, b + back)))
    return mesh(name, verts, norms, faces, mat)

# Source at the left, wavelength selector next, two cells in the middle and
# detector at the right (light travels left -> right on screen), matching the visible operator-side teaching cutaway.
rounded_box("LightSource", (MX(.324), .245, MID_Z), (.030, .057, .082), .006, lamp)
rounded_box("SourceWindow", (MX(.308), BEAM_Y, MID_Z), (.003, .022, .029), .001, source_glow)
rounded_box("Monochromator", (MX(.2665), .245, MID_Z), (.078, .056, .205), .006, mono_housing)   # diperlebar agar prisma, pelangi, dan celah muat berurutan
rounded_box("Detector", (MX(.012), .245, MID_Z), (.030, .050, .215), .006, lamp)
for label, z in (("Blank", BLANK_Z), ("Sample", SAMPLE_Z)):
    rounded_box("OpticalSlit" + label, (MX(.233), BEAM_Y, z), (.003, .014, .019), .001, light)
    rounded_box("DetectorWindow" + label, (MX(.030), BEAM_Y, z), (.003, .014, .019), .001, steel)
# Layar detektor (merah) di atas detektor, mengikuti diagram acuan; angka hidupnya ditampilkan app.js.
rounded_box("DetectorDisplayBody", (MX(.012), .2715, MID_Z), (.024, .003, .070), .001, display_black)
rounded_box("DetectorDisplayPlate", (MX(.012), .2738, MID_Z), (.018, .0012, .050), .0004, display_glow)
for label, z, mat, halo, pulse in (("Reference", BLANK_Z, beam_ref, halo_ref, pulse_ref),
                                   ("Sample", SAMPLE_Z, beam_sample, halo_samp, pulse_samp)):
    rod(label + "SplitFromMonochromator", (MX(.232), BEAM_Y, MID_Z), (MX(.213), BEAM_Y, z), .0022, mat, 10)
    rod(label + "SplitHalo", (MX(.232), BEAM_Y, MID_Z), (MX(.213), BEAM_Y, z), .0065, halo, 10)
    rod(label + "BeamThroughCuvette", (MX(.213), BEAM_Y, z), (MX(.030), BEAM_Y, z), .0026, mat, 10)
    rod(label + "BeamHalo", (MX(.213), BEAM_Y, z), (MX(.030), BEAM_Y, z), .0085, halo, 12)
    rod(label + "Lens", (MX(.199), BEAM_Y, z), (MX(.203), BEAM_Y, z), .017, lens_glass, 24)   # lensa pemfokus sebelum kuvet
    sphere(label + "Pulse", (MX(.213), BEAM_Y, z), .0055, pulse, 12, 7)                    # pulsa foton, digerakkan app.js

# Lampu di kanan: bola pijar kecil + halo, lalu berkas putih menuju prisma di dalam monokromator.
sphere("SourceBulbCore", (MX(.306), BEAM_Y, MID_Z), .0085, bulb_core)
sphere("SourceBulbHalo", (MX(.306), BEAM_Y, MID_Z), .015, bulb_halo)
# Susunan mengikuti diagram acuan (arah cahaya ke kiri): berkas putih -> PRISMA (segitiga sama sisi, puncak ke atas)
# -> pelangi melebar -> CELAH hitam -> satu berkas satu warna. Merah di atas, violet di bawah.
# Prisma berdiri seperti kuvet: sisi segitiganya (alas rata di bawah, puncak di atas) menghadap kotak slit hitam,
# memanjang sepanjang arah cahaya (sumbu x), bukan menghadap depan/belakang.
PRISM_X, PRISM_S, PRISM_LX = MX(.284), .028, .007            # pusat x, sisi segitiga sama sisi, setengah panjang sepanjang x
PRISM_H = PRISM_S * math.sqrt(3) / 2
APEX_X, FAN_L, FAN_SPREAD = PRISM_X + PRISM_LX, .030, .022   # titik asal pelangi = tengah sisi kiri prisma
ENTRY_X = PRISM_X - PRISM_LX                              # titik masuk berkas putih = tengah sisi kanan prisma
# Kondensor (Condenser) di antara lampu dan prisma, seperti diagram acuan: cahaya dari lampu menyebar,
# lensa mengumpulkannya menjadi berkas sejajar, lalu berkas sejajar itu masuk ke prisma.
COND_X, COND_R, COND_T = MX(.2985), .0135, .005
LAMP_X = MX(.3055)
COND_IN, COND_OUT = COND_X - COND_T / 2, COND_X + COND_T / 2      # cahaya berjalan ke arah +x pada koordinat ini
lens("CondenserLens", COND_X, BEAM_Y, MID_Z, COND_R, COND_T, .0012, condenser_glass)
for i, dz in enumerate((-.010, 0, .010)):                 # berkas menyebar dari lampu menuju lensa
    rod(f"SourceDivergingRay{i}", (LAMP_X, BEAM_Y, MID_Z), (COND_IN, BEAM_Y, MID_Z + dz), .0014, incident, 8)
for i, dz in enumerate((-.006, .006)):                    # berkas sejajar sesudah lensa
    rod(f"CondensedParallelRay{i}", (COND_OUT, BEAM_Y, MID_Z + dz), (ENTRY_X, BEAM_Y, MID_Z + dz), .0014, incident, 8)
rod("IncidentWhiteRay", (COND_OUT, BEAM_Y, MID_Z), (ENTRY_X, BEAM_Y, MID_Z), .0032, incident, 12)
rod("IncidentGlowRay", (COND_OUT, BEAM_Y, MID_Z), (ENTRY_X, BEAM_Y, MID_Z), .0095, inc_glow, 12)
prism_mesh("MonoPrism", [(MID_Z - PRISM_S / 2, BEAM_Y - PRISM_H / 2), (MID_Z + PRISM_S / 2, BEAM_Y - PRISM_H / 2),
                         (MID_Z, BEAM_Y + PRISM_H / 2)],
           PRISM_X - PRISM_LX, PRISM_X + PRISM_LX, prism_glass, axis="x")
rotor = len(doc["nodes"])
doc["nodes"].append({"name": "MonoRotor", "translation": [-APEX_X, BEAM_Y, MID_Z], "children": []})
doc["nodes"][0]["children"].append(rotor)
for i, (n, _c) in enumerate(BANDS):
    z0 = -FAN_SPREAD / 2 + i * FAN_SPREAD / 7
    prism_mesh("Band" + n, [(0, 0), (FAN_L, z0), (FAN_L, z0 + FAN_SPREAD / 7)], -.002, .002, band_mats[i], rotor)
# Celah keluar (slit): dua pelat hitam tinggi seperti pada diagram acuan, tepat sesudah pelangi.
# Hanya pita warna yang jatuh pada celah sempit di tengah yang lolos; pita lain terhalang pelat.
SLIT_T, SLIT_H, SLIT_LEN, GAP = .004, .050, .045, .00275
SLIT_X = APEX_X + FAN_L + .0005 + SLIT_T / 2
for sgn, nm in ((1, "Top"), (-1, "Bottom")):
    rounded_box("SlitPlate" + nm, (SLIT_X, .248, MID_Z + sgn * (GAP + SLIT_LEN / 2)), (SLIT_T, SLIT_H, SLIT_LEN), .0006, slit_black)
    rounded_box("SlitRim" + nm, (SLIT_X, .248, MID_Z + sgn * (GAP + .0004)), (SLIT_T + .0012, SLIT_H + .0012, .0008), .0003, slit_rim)
rod("SelectedBeam", (SLIT_X, BEAM_Y, MID_Z), (MX(.232), BEAM_Y, MID_Z), .0026, sel_core, 10)
rod("SelectedGlow", (SLIT_X, BEAM_Y, MID_Z), (MX(.232), BEAM_Y, MID_Z), .0085, sel_glow, 12)
# Pembagi berkas (pelat kaca 45 derajat) tepat di titik percabangan.
quad("BeamSplitter", [(MX(.226), .243, MID_Z - .006), (MX(.238), .243, MID_Z + .006),
                      (MX(.238), .273, MID_Z + .006), (MX(.226), .273, MID_Z - .006)], splitter_glass)


# ---- Komponen dalam alat (terlihat saat Mode transparan), mengikuti ilustrasi cutaway brosur Cary 100/300:
# dua lampu (deuterium + tungsten) dengan reflektor dan lensa, cermin datar dan cekung, pra-monokromator,
# monokromator (kisi), celah variabel, chopper ganda, jalur merah dengan panah, lalu modul detektor (PMT),
# motor, rel/papan optik berskrup emas, papan elektronik, catu daya dan kipas.
def dsm(idx):
    doc["materials"][idx]["doubleSided"] = True
    return idx
for _m in (mirror_mat, internal_metal, internal_dark, internal_pcb, internal_lamp, internal_ray):
    dsm(_m)
gold = dsm(material("InternalGold", (.86, .66, .22, 1), .3, .85))
plate = dsm(material("InternalPlate", (.70, .75, .78, 1), .55, .2))
int_glass = material("InternalGlass", (.62, .82, .96, .42), .08, alpha=True)
chamber_ray = material("ChamberRay", (.95, .12, .10, 0), .3, alpha=True, emissive=(.9, .08, .05))   # app.js menyalakannya saat mode transparan
mirror_blue = dsm(material("InternalMirrorBlue", (.38, .60, .80, 1), .1, .9))

def norm3(v):
    n = math.sqrt(sum(x * x for x in v)) or 1
    return tuple(x / n for x in v)

def pivot(name, c):
    """Node pemutar di titik c (koordinat build); anak-anaknya digambar relatif terhadap c. app.js memutarnya saat scan."""
    idx = len(doc["nodes"])
    doc["nodes"].append({"name": name, "translation": [-c[0], c[1], c[2]], "children": []})
    doc["nodes"][0]["children"].append(idx)
    return idx

def rel(p, c):
    return tuple(p[i] - c[i] for i in range(3))

def revolve(name, c, axis, prof, mat, seg=20, parent=0):
    """Benda putar mengelilingi sumbu `axis` melalui titik c; prof = [(h sepanjang sumbu, r jari-jari), ...]."""
    ax = norm3(axis)
    ref = (0, 1, 0) if abs(ax[1]) < .85 else (1, 0, 0)
    sd = norm3((ax[1] * ref[2] - ax[2] * ref[1], ax[2] * ref[0] - ax[0] * ref[2], ax[0] * ref[1] - ax[1] * ref[0]))
    up = (ax[1] * sd[2] - ax[2] * sd[1], ax[2] * sd[0] - ax[0] * sd[2], ax[0] * sd[1] - ax[1] * sd[0])
    verts, norms, faces = [], [], []
    for i, (h, r) in enumerate(prof):
        p0, p1 = prof[max(0, i - 1)], prof[min(len(prof) - 1, i + 1)]
        dh, dr = p1[0] - p0[0], p1[1] - p0[1]
        ln = math.hypot(dh, dr) or 1
        nh, nr = -dr / ln, dh / ln
        for j in range(seg):
            a = 2 * math.pi * j / seg
            radial = tuple(math.cos(a) * sd[k] + math.sin(a) * up[k] for k in range(3))
            verts.append(tuple(c[k] + ax[k] * h + radial[k] * r for k in range(3)))
            norms.append(norm3(tuple(ax[k] * nh + radial[k] * nr for k in range(3))))
    for i in range(len(prof) - 1):
        for j in range(seg):
            k = (j + 1) % seg
            p, q = i * seg + j, i * seg + k
            faces.extend(((p, q, p + seg), (q, q + seg, p + seg)))
    return mesh(name, verts, norms, faces, mat, parent)

def disc(name, c, axis, r, t, mat, seg=28, parent=0):
    revolve(name, c, axis, [(-t / 2, 0), (-t / 2, r), (t / 2, r), (t / 2, 0)], mat, seg, parent)

def tube(name, a, b, r, mat, seg=18, parent=0):
    d = tuple(b[i] - a[i] for i in range(3)); L = math.sqrt(sum(x * x for x in d))
    revolve(name, a, d, [(0, 0), (0, r), (L, r), (L, 0)], mat, seg, parent)

def concave(name, c, axis, r, depth, mat=mirror_blue, seg=22):
    """Cermin cekung: muka melengkung menghadap +axis, pelat belakang tebal 2 mm."""
    front = [(depth * (k / 6) ** 2, r * k / 6) for k in range(5, -1, -1)]
    revolve(name, c, axis, [(-.003, 0), (-.003, r), (depth, r)] + front, mat, seg)

def gold_screws(prefix, pts, r=.0030):
    for i, p in enumerate(pts):
        sphere(f"{prefix}{i}", p, r, gold, 8, 5)

IY = .265
def arrow(name, p, d):
    revolve(name, p, d, [(-.006, .0048), (.006, 0)], internal_ray, 10)
def ray3(name, a, b, arrows=True):
    rod(name, a, b, .0017, internal_ray, 8)
    if arrows:
        arrow(name + "Arrow", tuple((a[i] + b[i]) / 2 for i in range(3)), tuple(b[i] - a[i] for i in range(3)))
def ray(name, a, b):
    ray3(name, (a[0], IY, a[1]), (b[0], IY, b[1]))
def poly(name, pts):
    for i in range(len(pts) - 1):
        ray(f"{name}{i}", pts[i], pts[i + 1])
def mirror(name, x, z, vin, vout, y=IY, base=.236):
    """Cermin datar 45 derajat: bidangnya tegak lurus (vout - vin) sehingga memantulkan berkas vin menjadi vout."""
    nx, nz = vout[0] - vin[0], vout[1] - vin[1]
    ln = math.hypot(nx, nz) or 1
    tx, tz = -nz / ln, nx / ln
    hl, hh = .017, .015
    quad(name, [(x - tx * hl, y - hh, z - tz * hl), (x + tx * hl, y - hh, z + tz * hl),
                (x + tx * hl, y + hh, z + tz * hl), (x - tx * hl, y + hh, z - tz * hl)], mirror_blue)
    gold_screws(name + "Screw", [(x - tx * hl, y + hh, z - tz * hl), (x + tx * hl, y + hh, z + tz * hl)], .0026)
    rod(name + "Post", (x, base, z), (x, y - hh, z), .0035, internal_metal, 8)
    rounded_box(name + "Foot", (x, base - .002, z), (.022, .004, .022), .001, plate)
def cmirror(name, x, z, toward, y=IY, base=.236, r=.0125):
    """Cermin cekung di (x,z) menghadap titik `toward`."""
    d = (toward[0] - x, 0, toward[1] - z)
    concave(name, (x, y, z), d, r, r * .4)
    rod(name + "Post", (x, base, z), (x, y - r, z), .0035, internal_metal, 8)
    rounded_box(name + "Foot", (x, base - .002, z), (.022, .004, .022), .001, plate)
    gold_screws(name + "Screw", [(x - d[2] / (math.hypot(d[0], d[2]) or 1) * r, y + r * .6, z + d[0] / (math.hypot(d[0], d[2]) or 1) * r)], .0026)

# papan optik (bench) dan rel berskrup emas
rounded_box("InternalBaseplate", (0, .0525, 0), (1.04, .004, .72), .001, plate)
rounded_box("InternalOpticsBench", (-.295, .2315, .200), (.455, .005, .300), .001, plate)
gold_screws("BenchScrew", [(-.52, .236, .06), (-.07, .236, .06), (-.52, .236, .34), (-.07, .236, .34), (-.295, .236, .34), (-.295, .236, .06)])
rod("InternalGuideBar", (-.04, .240, .228), (.40, .240, .228), .011, plate, 4)
gold_screws("RailScrew", [(-.02 + i * .070, .253, .228) for i in range(7)], .0026)

# --- lampu: deuterium (atas) dan tungsten (bawah), masing-masing reflektor + lensa + cincin emas
LAMP_D, LAMP_W = (-.47, .300), (-.47, .222)
for nm, (lx, lz) in (("Deuterium", LAMP_D), ("Tungsten", LAMP_W)):
    tube("InternalLampBody" + nm, (lx - .060, IY, lz), (lx - .008, IY, lz), .019, internal_dark)
    tube("InternalLampCap" + nm, (lx - .072, IY, lz), (lx - .060, IY, lz), .022, internal_metal)
    revolve("InternalLampReflector" + nm, (lx - .008, IY, lz), (1, 0, 0), [(0, .019), (.012, .026)], mirror_blue, 22)
    sphere("InternalBulb" + nm, (lx - .004, IY, lz), .010, internal_lamp, 14, 8)
    lens("InternalLampLens" + nm, lx + .032, IY, lz, .026, .010, .002, int_glass)
    tube("InternalLampLensRing" + nm, (lx + .028, IY, lz), (lx + .036, IY, lz), .0285, gold)
ray3("InternalRayD", (-.46, IY, .300), (-.36, IY, .300))
ray3("InternalRayW", (-.46, IY, .222), (-.36, IY, .222))
M1, M2 = (-.36, .300), (-.36, .170)
mirror("InternalMirror1", M1[0], M1[1], (1, 0), (0, -1))
mirror("InternalMirror2", M2[0], M2[1], (0, -1), (1, 0))
mirror("InternalMirrorW", M1[0], LAMP_W[1], (1, 0), (0, 1))
ray("InternalRayWup", (M1[0], LAMP_W[1]), M1)
ray("InternalRay12", M1, M2)
ray("InternalRay2Pre", M2, (-.305, .170))

# --- celah masuk pra-monokromator (dua pelat hitam) lalu pra-monokromator: cermin cekung + kisi
def slit_pair(name, x, z, gap=.004):
    for sgn, side in ((1, "A"), (-1, "B")):
        rounded_box(f"{name}{side}", (x, IY, z + sgn * (gap / 2 + .009)), (.004, .040, .018), .0008, slit_black)
    gold_screws(name + "Screw", [(x, IY + .022, z + .018), (x, IY + .022, z - .018)], .0022)
slit_pair("InternalEntranceSlit", -.300, .170)
rounded_box("InternalPreTray", (-.262, .2345, .180), (.075, .007, .090), .002, internal_dark)
cmirror("InternalPreC1", -.235, .205, (-.285, .170))
cmirror("InternalPreC2", -.235, .150, (-.262, .222))
GP1 = (-.268, IY, .222); pv1 = pivot("RockGratingPre", GP1)
rounded_box("InternalPreGrating", (0, 0, 0), (.020, .038, .006), .001, mirror_mat, pv1)
poly("InternalPreRay", [(-.292, .170), (-.235, .205), (-.268, .222), (-.235, .150), (-.222, .170)])
slit_pair("InternalPreExitSlit", -.222, .170)

# --- monokromator utama: dua cermin cekung + kisi di meja putar, celah keluar variabel
rounded_box("InternalMonoTray", (-.172, .2345, .185), (.075, .007, .115), .002, internal_dark)
cmirror("InternalMonoC1", -.150, .222, (-.205, .170))
cmirror("InternalMonoC2", -.150, .130, (-.172, .245))
GP2 = (-.180, IY, .245); pv2 = pivot("RockGratingMono", GP2)
rounded_box("InternalGrating", (0, 0, 0), (.028, .040, .006), .001, mirror_mat, pv2)
rod("InternalGratingTurntable", (-.180, .2365, .245), (-.180, IY - .020, .245), .006, internal_metal, 12)
slit_pair("InternalMonoEntranceSlit", -.205, .170)
poly("InternalMonoRay", [(-.198, .170), (-.150, .222), (-.180, .245), (-.150, .130), (-.138, .170)])
slit_pair("InternalMonoExitSlit", -.136, .170, .003)

# --- chopper ganda: dua cakram bersektor pada satu poros motor
CC = (-.115, IY - .004, .185); pvc = pivot("SpinChopper", CC)
disc("InternalChopperA", (0, 0, 0), (0, 1, 0), .024, .003, internal_metal, 28, pvc)
disc("InternalChopperB", (0, -.032, 0), (0, 1, 0), .030, .003, internal_metal, 28, pvc)
for i in range(4):                    # sektor gelap pada cakram atas dan tiang penghubung kedua cakram
    a_ = i * math.pi / 2 + .4
    rod(f"InternalChopperSector{i}", (.008 * math.cos(a_), .0017, .008 * math.sin(a_)),
        (.022 * math.cos(a_), .0017, .022 * math.sin(a_)), .005, internal_dark, 8, pvc)
    rod(f"InternalChopperStrut{i}", (.020 * math.cos(a_ + .7), 0, .020 * math.sin(a_ + .7)),
        (.020 * math.cos(a_ + .7), -.032, .020 * math.sin(a_ + .7)), .0012, internal_metal, 6, pvc)
tube("InternalChopperShaft", (0, -.07, 0), (0, .004, 0), .0035, internal_metal, 10, pvc)
tube("InternalChopperMotor", (-.115, IY - .108, .185), (-.115, IY - .075, .185), .014, internal_dark, 16)
poly("InternalRayChop", [(-.136, .170), (-.075, .170)])
# --- lensa pemfokus + celah keluar menuju kompartemen sampel
lens("InternalExitLens", -.075, IY, .170, .020, .009, .002, int_glass)
tube("InternalExitLensRing", (-.079, IY, .170), (-.071, IY, .170), .0225, gold)
# --- ruang bahu belakang kanan: pelat dasar, rel, kluster cermin, dan jalur turun ke ruang detektor di bawah dek
def cross3(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def mirror3(name, c, vin, vout, hl=.016, hh=.013):
    """Cermin datar 3D: memantulkan berkas arah vin menjadi vout (boleh naik/turun)."""
    n = norm3(tuple(vout[i] - vin[i] for i in range(3)))
    ref = (0, 1, 0) if abs(n[1]) < .9 else (1, 0, 0)
    u = norm3(cross3(n, ref)); v = cross3(n, u)
    corners = [tuple(c[i] + sx * hl * u[i] + sy * hh * v[i] for i in range(3)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    quad(name, corners, mirror_blue)
    gold_screws(name + "Screw", [corners[2], corners[3]], .0026)
rounded_box("InternalShoulderPlate", (.196, .2285, .250), (.480, .005, .200), .001, plate)
rounded_box("InternalMirrorPlateS1", (.040, .2335, .228), (.045, .004, .150), .001, internal_dark)
mirror("InternalMirrorS1", .040, .170, (1, 0), (0, 1))
mirror("InternalMirrorS2", .040, .285, (0, 1), (1, 0))
mirror("InternalMirrorS3", .360, .285, (1, 0), (0, -1))
mirror3("InternalMirrorS4", (.360, IY, .185), (0, 0, -1), (0, -1, 0))
mirror3("InternalMirrorS5", (.360, .150, .185), (0, -1, 0), (0, 0, -1))
mirror("InternalMirrorS6", .360, -.027, (0, -1), (1, 0), .150, .0545)
poly("InternalRayShoulder", [(-.075, .170), (.040, .170), (.040, .285), (.360, .285), (.360, .185)])
ray3("InternalRayRiser", (.360, IY, .185), (.360, .150, .185))
ray3("InternalRayLowerFeed", (.360, .150, .185), (.360, .150, -.027))
ray3("InternalRayToDish", (.360, .150, -.027), (.380, .150, -.027), False)
for nm, (xx, zz) in (("A", (.20, .285)), ("B", (.20, .170))):          # blok pemegang cermin berskrup emas
    rounded_box("InternalShoulderBlock" + nm, (xx, .2385, zz), (.050, .014, .030), .002, internal_dark)
    gold_screws("InternalShoulderBlockScrew" + nm, [(xx - .018, .2475, zz), (xx + .018, .2475, zz)], .0026)

# --- motor penggerak panjang gelombang (silinder, kiri depan) dan baterai kapasitor
tube("InternalStepperMotor", (-.46, .115, -.04), (-.36, .115, -.04), .036, internal_dark, 24)
tube("InternalStepperCap", (-.36, .115, -.04), (-.345, .115, -.04), .030, internal_metal, 24)
tube("InternalStepperShaft", (-.345, .115, -.04), (-.30, .115, -.04), .006, internal_metal, 10)
pvg = pivot("SpinGear", (-.31, .115, -.04))
disc("InternalDriveGear", (0, 0, 0), (1, 0, 0), .026, .008, gold, 24, pvg)
for i in range(8):
    a_ = i * math.pi / 4
    rod(f"InternalGearTooth{i}", (-.004, .026 * math.cos(a_), .026 * math.sin(a_)), (.004, .026 * math.cos(a_), .026 * math.sin(a_)), .0035, gold, 6, pvg)
rounded_box("InternalPCB", (-.20, .068, -.20), (.34, .010, .26), .002, internal_pcb)
for i in range(5):
    rod(f"InternalCapacitor{i}", (-.30 + i * .045, .074, -.12), (-.30 + i * .045, .108, -.12), .011, internal_metal, 12)
for i in range(6):                    # chip kecil pada papan
    rounded_box(f"InternalChip{i}", (-.30 + i * .052, .078, -.26 + (i % 2) * .05), (.030, .006, .020), .001, internal_dark)

# --- modul detektor di kanan: cermin pengumpul cekung + tabung PMT + soket, berkas merah dari kedua kuvet
DY = .150
rounded_box("InternalDetectorHousing", (.425, DY, -.027), (.100, .060, .210), .006, internal_dark)
internal_black = dsm(material("InternalBlack", (.045, .05, .06, 1), .35, .5))
concave("InternalCollectorMirror", (.392, DY, -.027), (-1, 0, 0), .048, .018, internal_black)
tube("InternalPMTTube", (.410, DY, -.027), (.470, DY, -.027), .020, int_glass, 22)
tube("InternalPMTRing1", (.425, DY, -.027), (.431, DY, -.027), .0235, gold, 22)
tube("InternalPMTRing2", (.455, DY, -.027), (.461, DY, -.027), .0235, gold, 22)
tube("InternalPMTBase", (.470, DY, -.027), (.490, DY, -.027), .017, internal_metal, 22)
for i in range(7):
    rod(f"InternalPMTPin{i}", (.490, DY + .010 * math.cos(i), -.027 + .010 * math.sin(i)),
        (.505, DY + .010 * math.cos(i), -.027 + .010 * math.sin(i)), .0013, gold, 6)
for nm, z in (("Ref", BLANK_Z), ("Samp", SAMPLE_Z)):
    ray3("InternalDetRay" + nm, (.335, DY, z), (.372, DY, -.027 + (z - MID_Z) * .35))
rod("InternalDetRayFocus", (.372, DY, -.027 + (BLANK_Z - MID_Z) * .35), (.405, DY, -.027), .0017, internal_ray, 8)
rod("InternalDetRayFocus2", (.372, DY, -.027 + (SAMPLE_Z - MID_Z) * .35), (.405, DY, -.027), .0017, internal_ray, 8)
rounded_box("InternalAccessoryBoard", (.44, .068, .17), (.19, .008, .22), .002, internal_pcb)
rounded_box("InternalPowerSupply", (.45, .105, -.255), (.16, .085, .12), .006, internal_dark)
tube("InternalFanRing", (.47, .120, .26), (.47, .120, .292), .048, internal_dark, 28)
pvf = pivot("SpinFan", (.47, .120, .296))
for i in range(6):
    a_ = i * math.pi / 3
    rod(f"InternalFanBlade{i}", (0, 0, 0), (.040 * math.cos(a_), .040 * math.sin(a_), .003), .007, internal_metal, 6, pvf)
disc("InternalFanHub", (0, 0, .002), (0, 0, 1), .013, .008, internal_dark, 14, pvf)

# --- berkas merah yang melintasi kompartemen sampel (referensi dan sampel); hanya terlihat di mode transparan
for nm, z in (("Reference", BLANK_Z), ("Sample", SAMPLE_Z)):
    rod("ChamberRay" + nm, (MX(.234), BEAM_Y, z), (MX(.030), BEAM_Y, z), .0017, chamber_ray, 8)

# --- kelompok optik bawah (depan), seperti ruang optik bawah di brosur: laras lensa, cermin datar dan cekung, berkas merah
LY, LB = .100, .0545
tube("InternalLowerBarrel", (-.060, LY, -.285), (-.010, LY, -.285), .019, internal_dark)
for xx in (-.060, -.034, -.010):
    tube(f"InternalLowerBarrelRing{xx}", (xx - .002, LY, -.285), (xx + .002, LY, -.285), .0215, gold)
lens("InternalLowerLens", -.030, LY, -.285, .016, .007, .002, int_glass)
mirror("InternalLowMirrorB", .10, -.285, (1, 0), (0, -1), LY, LB)
mirror("InternalLowMirrorC", .10, -.335, (0, -1), (1, 0), LY, LB)
cmirror("InternalLowDishD", .20, -.335, (.26, -.285), LY, LB, .030)
mirror("InternalLowMirrorE", .26, -.285, (0, 1), (1, 0), LY, LB)
tube("InternalLowerBarrel2", (.295, LY, -.285), (.335, LY, -.285), .017, internal_dark)
tube("InternalLowerBarrelRing2", (.293, LY, -.285), (.297, LY, -.285), .0195, gold)
LOWPATH = [(-.010, -.285), (.10, -.285), (.10, -.335), (.20, -.335), (.26, -.285), (.295, -.285)]
for i in range(len(LOWPATH) - 1):
    a_, b_ = LOWPATH[i], LOWPATH[i + 1]
    ray3(f"InternalLowRay{i}", (a_[0], LY, a_[1]), (b_[0], LY, b_[1]))
tube("InternalLampTower", (-.44, .055, -.26), (-.44, .135, -.26), .022, internal_dark, 22)
tube("InternalLampTowerRing", (-.44, .105, -.26), (-.44, .112, -.26), .0255, gold, 22)
sphere("InternalLampTowerBulb", (-.44, .140, -.26), .014, internal_lamp, 14, 8)
tube("InternalSupportColumnA", (-.50, .055, .30), (-.50, .160, .30), .014, internal_metal, 14)
tube("InternalSupportColumnB", (.20, .055, .30), (.20, .205, .30), .014, internal_metal, 14)

# --- garis tepi biru (seperti gambar potongan di brosur); alfa 0 sampai app.js menyalakannya
outline_mat = material("OutlineBlue", (.20, .26, .80, 0), .4, alpha=True, emissive=(.12, .16, .55))
def box_edges(name, c, size, r=.0022):
    hx, hy, hz = (v / 2 for v in size)
    pts = [(c[0] + sx * hx, c[1] + sy * hy, c[2] + sz * hz) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    k = 0
    for i in range(8):
        for j in range(i + 1, 8):
            diff = sum(1 for t in range(3) if pts[i][t] != pts[j][t])
            if diff == 1:
                rod(f"{name}{k}", pts[i], pts[j], r, outline_mat, 6); k += 1
box_edges("OutlineBody", (0, .120, -.014), (1.10, .19, .75))
box_edges("OutlineOptics", (-.294, .303, .198), (.465, .150, .316))
box_edges("OutlineDeckRight", (.449, .230, -.026), (.19, .038, .70), .0016)
box_edges("OutlineWell", (.166, .231, -.027), (.36, .058, .40), .0016)

# --- bola pulsa cahaya (digandakan dan digerakkan app.js) dan jalur geraknya, disimpan di node Instrument.extras
pulse_int = glow("InternalPulse", (1, .93, .55))
sphere("InternalPulse", (0, 0, 0), .0058, pulse_int, 12, 7)
P_MAIN = [(-.46, IY, .30), (M1[0], IY, M1[1]), (M2[0], IY, M2[1]), (-.305, IY, .170), (-.292, IY, .170), (-.235, IY, .205), (-.268, IY, .222),
          (-.235, IY, .150), (-.222, IY, .170), (-.198, IY, .170), (-.150, IY, .222), (-.180, IY, .245), (-.150, IY, .130), (-.138, IY, .170),
          (-.075, IY, .170), (.040, IY, .170), (.040, IY, .285), (.360, IY, .285), (.360, IY, .185), (.360, .150, .185), (.360, .150, -.027), (.392, .150, -.027)]
P_W = [(-.46, .222), (-.36, .222), (-.36, .30), (-.36, .17)]
paths = [
    {"pts": [list(p) for p in P_MAIN], "n": 12},
    {"pts": [[x, IY, z] for x, z in P_W], "n": 3},
    {"pts": [[x, LY, z] for x, z in LOWPATH], "n": 4},
]
for nm, z in (("Ref", BLANK_Z), ("Samp", SAMPLE_Z)):
    paths.append({"pts": [[.335, DY, z], [.372, DY, -.027 + (z - MID_Z) * .35], [.405, DY, -.027]], "n": 2})
doc["nodes"][0]["extras"] = {"paths": paths}

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
