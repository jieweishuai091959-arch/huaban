import base64
import pathlib

root = pathlib.Path(r"C:\Users\Windows 10\Desktop\立烨\画板制作")
png = root / "assets" / "lineart-720.png"
out = root / "assets" / "lineart.js"

b64 = base64.b64encode(png.read_bytes()).decode()
header = (
    "// 卡通线稿（内嵌 Base64，避免 file:// 下 canvas 跨域污染）\n"
    'window.LINEART_IMAGE = "data:image/png;base64,'
)
out.write_text(header + b64 + '";\n', encoding="utf-8")
print("js KB:", round(out.stat().st_size / 1024, 1))
