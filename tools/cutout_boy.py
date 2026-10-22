"""Cut the white outer background of the new boy line art into transparency."""
from collections import deque

import numpy as np
from PIL import Image

SRC = r"C:\Users\Windows 10\Desktop\立烨\画板制作\assets\lineart-source.jpg"
DST_FULL = r"C:\Users\Windows 10\Desktop\立烨\画板制作\assets\lineart.png"
DST_SMALL = r"C:\Users\Windows 10\Desktop\立烨\画板制作\assets\lineart-720.png"

img = Image.open(SRC).convert("RGBA")
arr = np.array(img)
h, w = arr.shape[:2]
print("size:", w, "x", h)

rgb = arr[:, :, :3].astype(np.int16)
mask = (rgb[:, :, 0] >= 244) & (rgb[:, :, 1] >= 244) & (rgb[:, :, 2] >= 244)

visited = np.zeros((h, w), dtype=bool)
queue = deque()

for x in range(w):
    for y in (0, h - 1):
        if mask[y, x] and not visited[y, x]:
            visited[y, x] = True
            queue.append((y, x))
for y in range(h):
    for x in (0, w - 1):
        if mask[y, x] and not visited[y, x]:
            visited[y, x] = True
            queue.append((y, x))

while queue:
    y, x = queue.popleft()
    for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not visited[ny, nx]:
            visited[ny, nx] = True
            queue.append((ny, nx))

arr[:, :, 3] = np.where(visited, 0, 255).astype(np.uint8)

edge = np.zeros((h, w), dtype=bool)
edge[:-1, :] |= visited[1:, :]
edge[1:, :] |= visited[:-1, :]
edge[:, :-1] |= visited[:, 1:]
edge[:, 1:] |= visited[:, :-1]
ring = edge & ~visited & (rgb.sum(axis=2) > 700)
alpha = arr[:, :, 3].astype(np.float32)
alpha[ring] = 170
arr[:, :, 3] = alpha.astype(np.uint8)

out = Image.fromarray(arr)
out.save(DST_FULL, "PNG", optimize=True)
out.resize((738, 1312), Image.LANCZOS).save(DST_SMALL, "PNG", optimize=True)

print("transparent %", round((visited.mean() * 100), 1))
print("full KB", round(__import__("os").path.getsize(DST_FULL) / 1024, 1))
print("small KB", round(__import__("os").path.getsize(DST_SMALL) / 1024, 1))
