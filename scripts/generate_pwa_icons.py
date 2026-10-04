import zlib
import struct
import math
import os

def create_png(width, height, get_pixel):
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # filter type None
        for x in range(width):
            r, g, b, a = get_pixel(x, y, width, height)
            raw_data.extend([r, g, b, a])
    
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        crc = zlib.crc32(tag + data) & 0xffffffff
        return c + struct.pack('>I', crc)
    
    png = bytearray(b'\x89PNG\r\n\x1a\n')
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png.extend(chunk(b'IHDR', ihdr))
    png.extend(chunk(b'IDAT', zlib.compress(bytes(raw_data), 9)))
    png.extend(chunk(b'IEND', b''))
    return bytes(png)

def render_finflow_icon(x, y, width, height, is_maskable=False):
    # Normalized coordinates from -1.0 to 1.0
    nx = (x / (width - 1)) * 2.0 - 1.0
    ny = (y / (height - 1)) * 2.0 - 1.0

    # For maskable icons, scale down coordinates so emblem sits comfortably in the safe zone
    scale = 0.72 if is_maskable else 0.88
    sx = nx / scale
    sy = ny / scale

    dist_center = math.sqrt(nx * nx + ny * ny)

    # Base background: Dark navy/slate (#0b0f17 to #0e1726)
    # Radial dark gradient
    bg_t = min(1.0, dist_center * 0.8)
    r = int(14 * (1 - bg_t) + 7 * bg_t)
    g = int(23 * (1 - bg_t) + 11 * bg_t)
    b = int(38 * (1 - bg_t) + 19 * bg_t)
    a = 255

    if not is_maskable:
        # Rounded corner clipping for standard app icon
        corner_r = 0.22
        dx = max(0.0, abs(nx) - (1.0 - corner_r))
        dy = max(0.0, abs(ny) - (1.0 - corner_r))
        d_corner = math.sqrt(dx * dx + dy * dy)
        if d_corner > corner_r:
            return (0, 0, 0, 0)
        elif d_corner > corner_r - 0.02:
            # Antialiasing outer boundary
            edge_alpha = int(255 * (corner_r - d_corner) / 0.02)
            a = min(a, edge_alpha)

    # Ambient radial emerald glow around center
    glow_dist = math.sqrt(sx * sx + sy * sy)
    if glow_dist < 0.9:
        glow_intensity = math.exp(-3.5 * glow_dist * glow_dist)
        r = int(r + (16 - r) * glow_intensity * 0.35)
        g = int(g + (185 - g) * glow_intensity * 0.35)
        b = int(b + (129 - b) * glow_intensity * 0.35)

    # Outer decorative glowing circular arc (radius ~0.65, thickness 0.04)
    arc_dist = abs(glow_dist - 0.68)
    if arc_dist < 0.04:
        arc_intensity = (1.0 - (arc_dist / 0.04)) * 0.45
        r = int(r + (52 - r) * arc_intensity)
        g = int(g + (211 - g) * arc_intensity)
        b = int(b + (153 - b) * arc_intensity)

    # FinFlow "F" Emblem + Upward Growth Arrow
    # Main vertical stem: sx in [-0.34, -0.16], sy in [-0.48, 0.48]
    in_stem = (-0.34 <= sx <= -0.16) and (-0.48 <= sy <= 0.48)

    # Top horizontal bar: sx in [-0.16, 0.32], sy in [-0.48, -0.30]
    in_top_bar = (-0.16 <= sx <= 0.32) and (-0.48 <= sy <= -0.30)

    # Middle horizontal bar: sx in [-0.16, 0.18], sy in [-0.14, 0.04]
    in_mid_bar = (-0.16 <= sx <= 0.18) and (-0.14 <= sy <= 0.04)

    # Upward Growth Arrow:
    # Diagonal stem from (0.05, 0.38) to (0.40, 0.03)
    # Line equation: x - y ~ offset
    # Distance to diagonal segment from (0.04, 0.36) to (0.38, 0.02)
    # Parametric t on line:
    x1, y1 = 0.04, 0.36
    x2, y2 = 0.38, 0.02
    dx_line = x2 - x1
    dy_line = y2 - y1
    len_sq = dx_line * dx_line + dy_line * dy_line
    t = max(0.0, min(1.0, ((sx - x1) * dx_line + (sy - y1) * dy_line) / len_sq))
    proj_x = x1 + t * dx_line
    proj_y = y1 + t * dy_line
    dist_to_arrow_line = math.sqrt((sx - proj_x)**2 + (sy - proj_y)**2)
    in_arrow_stem = (dist_to_arrow_line <= 0.065)

    # Arrowhead at (0.38, 0.02):
    # Top horizontal barb: sx in [0.22, 0.44], sy in [0.00, 0.09]
    in_arrow_barb1 = (0.20 <= sx <= 0.42) and (-0.02 <= sy <= 0.08)
    # Vertical barb: sx in [0.32, 0.42], sy in [0.02, 0.24]
    in_arrow_barb2 = (0.32 <= sx <= 0.42) and (0.02 <= sy <= 0.24)

    is_emblem = in_stem or in_top_bar or in_mid_bar or in_arrow_stem or in_arrow_barb1 or in_arrow_barb2

    if is_emblem:
        # Emerald to Cyan vertical gradient (#34d399 -> #10b981 -> #06b6d4)
        t_grad = (sy + 0.5) / 1.0
        t_grad = max(0.0, min(1.0, t_grad))
        if t_grad < 0.5:
            # #34d399 (52, 211, 153) to #10b981 (16, 185, 129)
            gt = t_grad / 0.5
            r = int(52 * (1 - gt) + 16 * gt)
            g = int(211 * (1 - gt) + 185 * gt)
            b = int(153 * (1 - gt) + 129 * gt)
        else:
            # #10b981 (16, 185, 129) to #06b6d4 (6, 182, 212)
            gt = (t_grad - 0.5) / 0.5
            r = int(16 * (1 - gt) + 6 * gt)
            g = int(185 * (1 - gt) + 182 * gt)
            b = int(129 * (1 - gt) + 212 * gt)
    else:
        # Subtle antialiasing / glow fringe around emblem
        # Distance to stem/bars for soft edge
        pass

    return (r, g, b, a)

def create_ico(png_data):
    # Standard ICO header with single PNG entry
    # ICONDIR
    ico = bytearray()
    ico.extend(struct.pack('<HHH', 0, 1, 1)) # Reserved, Type 1 (ICO), Count 1
    # ICONDIRENTRY
    ico.extend(struct.pack('BBBBHHII', 32, 32, 0, 0, 1, 32, len(png_data), 22))
    ico.extend(png_data)
    return bytes(ico)

os.makedirs('public', exist_ok=True)

print("Generating pwa-192x192.png...")
png_192 = create_png(192, 192, lambda x, y, w, h: render_finflow_icon(x, y, w, h, False))
with open('public/pwa-192x192.png', 'wb') as f:
    f.write(png_192)

print("Generating pwa-512x512.png...")
png_512 = create_png(512, 512, lambda x, y, w, h: render_finflow_icon(x, y, w, h, False))
with open('public/pwa-512x512.png', 'wb') as f:
    f.write(png_512)

print("Generating pwa-maskable-512x512.png...")
png_maskable = create_png(512, 512, lambda x, y, w, h: render_finflow_icon(x, y, w, h, True))
with open('public/pwa-maskable-512x512.png', 'wb') as f:
    f.write(png_maskable)

print("Generating apple-touch-icon.png...")
png_apple = create_png(180, 180, lambda x, y, w, h: render_finflow_icon(x, y, w, h, False))
with open('public/apple-touch-icon.png', 'wb') as f:
    f.write(png_apple)

print("Generating favicon.ico...")
png_32 = create_png(32, 32, lambda x, y, w, h: render_finflow_icon(x, y, w, h, False))
with open('public/favicon.ico', 'wb') as f:
    f.write(create_ico(png_32))

print("All PWA icons generated successfully in /public!")
