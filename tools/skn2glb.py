"""Convierte gragas.skn + gragas.png (CommunityDragon) en un .glb para three.js.

Uso: python skn2glb.py <gragas.skn> <gragas.png> <salida.glb>
"""
import json
import struct
import sys


def read_skn(path):
    data = open(path, "rb").read()
    magic, major, minor = struct.unpack_from("<IHH", data, 0)
    if magic != 0x00112233:
        raise ValueError("no es un .skn")
    off = 8
    range_count = struct.unpack_from("<I", data, off)[0]
    off += 4
    ranges = []
    for _ in range(range_count):
        name = data[off:off + 64].split(b"\0")[0].decode()
        ranges.append((name, *struct.unpack_from("<4i", data, off + 64)))
        off += 80
    if major == 4:
        off += 4  # flags
    index_count, vertex_count = struct.unpack_from("<II", data, off)
    off += 8
    vertex_size = 52
    if major == 4:
        vertex_size = struct.unpack_from("<I", data, off)[0]
        off += 4 + 4 + 24 + 16  # tipo, bbox, esfera
    indices = struct.unpack_from(f"<{index_count}H", data, off)
    off += index_count * 2
    vertices = []
    for i in range(vertex_count):
        base = off + i * vertex_size
        pos = struct.unpack_from("<3f", data, base)
        normal = struct.unpack_from("<3f", data, base + 12 + 4 + 16)
        uv = struct.unpack_from("<2f", data, base + 12 + 4 + 16 + 12)
        vertices.append((pos, normal, uv))
    print(f"skn v{major}.{minor}: {vertex_count} vertices, {index_count // 3} tris, rangos: {ranges}")
    return vertices, indices


def write_glb(vertices, indices, png_path, out):
    # LoL usa coordenadas zurdas: se refleja X y se invierte el orden de las caras.
    pos = [(-p[0], p[1], p[2]) for p, _, _ in vertices]
    nor = [(-n[0], n[1], n[2]) for _, n, _ in vertices]
    uvs = [uv for _, _, uv in vertices]
    idx = []
    for i in range(0, len(indices), 3):
        idx += [indices[i], indices[i + 2], indices[i + 1]]

    def pad(b, fill=b"\0"):
        return b + fill * (-len(b) % 4)

    blobs = [
        pad(struct.pack(f"<{len(idx)}H", *idx)),
        b"".join(struct.pack("<3f", *p) for p in pos),
        b"".join(struct.pack("<3f", *n) for n in nor),
        b"".join(struct.pack("<2f", *u) for u in uvs),
        pad(open(png_path, "rb").read()),
    ]
    views, cursor = [], 0
    for blob in blobs:
        views.append({"buffer": 0, "byteOffset": cursor, "byteLength": len(blob)})
        cursor += len(blob)
    binary = b"".join(blobs)

    gltf = {
        "asset": {"version": "2.0", "generator": "skn2glb"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "Gragas"}],
        "meshes": [{"primitives": [{
            "attributes": {"POSITION": 1, "NORMAL": 2, "TEXCOORD_0": 3},
            "indices": 0,
            "material": 0,
        }]}],
        "materials": [{
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "metallicFactor": 0,
                "roughnessFactor": 0.75,
            },
            "doubleSided": True,
        }],
        "textures": [{"source": 0}],
        "images": [{"bufferView": 4, "mimeType": "image/png"}],
        "bufferViews": views,
        "accessors": [
            {"bufferView": 0, "componentType": 5123, "count": len(idx), "type": "SCALAR"},
            {"bufferView": 1, "componentType": 5126, "count": len(pos), "type": "VEC3",
             "min": [min(p[a] for p in pos) for a in range(3)],
             "max": [max(p[a] for p in pos) for a in range(3)]},
            {"bufferView": 2, "componentType": 5126, "count": len(nor), "type": "VEC3"},
            {"bufferView": 3, "componentType": 5126, "count": len(uvs), "type": "VEC2"},
        ],
        "buffers": [{"byteLength": len(binary)}],
    }
    js = pad(json.dumps(gltf, separators=(",", ":")).encode(), b" ")
    total = 12 + 8 + len(js) + 8 + len(binary)
    with open(out, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(binary), 0x004E4942) + binary)
    print(f"{out}: {total} bytes, bbox {gltf['accessors'][1]['min']} .. {gltf['accessors'][1]['max']}")


if __name__ == "__main__":
    verts, tris = read_skn(sys.argv[1])
    write_glb(verts, tris, sys.argv[2], sys.argv[3])
