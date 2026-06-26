"""
Background removal for pixel art sprites via flood-fill from corners.
Usage: python remove_bg.py input.png [output.png] [--threshold N]
"""
import sys
import argparse
from collections import deque
from PIL import Image

def remove_bg(img: Image.Image, threshold: int = 30) -> Image.Image:
    img = img.convert("RGBA")
    w, h = img.size
    pixels = img.load()

    # Sample background color from the 4 corners
    corners = [pixels[0, 0], pixels[w-1, 0], pixels[0, h-1], pixels[w-1, h-1]]
    # Use the most common corner color as bg (simple: average)
    br = sum(c[0] for c in corners) // 4
    bg = sum(c[1] for c in corners) // 4
    bb = sum(c[2] for c in corners) // 4
    bg_color = (br, bg, bb)

    def is_bg(px):
        return (abs(int(px[0]) - bg_color[0])**2 +
                abs(int(px[1]) - bg_color[1])**2 +
                abs(int(px[2]) - bg_color[2])**2) <= threshold**2

    visited = [[False] * h for _ in range(w)]
    queue = deque()

    # Seed from all edge pixels
    for x in range(w):
        for y in [0, h-1]:
            if not visited[x][y] and is_bg(pixels[x, y]):
                queue.append((x, y))
                visited[x][y] = True
    for y in range(h):
        for x in [0, w-1]:
            if not visited[x][y] and is_bg(pixels[x, y]):
                queue.append((x, y))
                visited[x][y] = True

    while queue:
        cx, cy = queue.popleft()
        r, g, b, a = pixels[cx, cy]
        pixels[cx, cy] = (r, g, b, 0)
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = cx+dx, cy+dy
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny] and is_bg(pixels[nx, ny]):
                visited[nx][ny] = True
                queue.append((nx, ny))

    return img


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output", nargs="?")
    parser.add_argument("--threshold", type=int, default=30)
    args = parser.parse_args()

    out_path = args.output or args.input
    img = Image.open(args.input)
    result = remove_bg(img, threshold=args.threshold)
    result.save(out_path, "PNG")
    print(f"Saved: {out_path}")
