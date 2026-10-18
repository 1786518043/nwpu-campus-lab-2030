# 长安校区地图与建筑参考

本记录仅供《2030校园实验室》原型制作。它区分官方资料、OpenStreetMap 数据与人工近似，不能作为实测地形或校园现状竣工图。

## 已核验来源

1. 西北工业大学官网《校园地图》：https://www.nwpu.edu.cn/info/1047/1051.htm
   - 页面文字：长安校区地图（建筑及道路标识正在完善中）；资料来源为发展规划处。
   - 页面没有清晰的地图版本日期。计算机学院转载页 https://jsj.nwpu.edu.cn/info/1948/14715.htm 日期为 2021-09-18，说明同一图早于本次原型，不能称为 2026 现状地图。
   - 原图链接：https://www.nwpu.edu.cn/changanxiaoquditu.jpg
   - 同校域名镜像（成功下载）：https://peixun.nwpu.edu.cn/changanxiaoquditu.jpg
   - 本地：public/reference/nwpu-changan-official-map.jpg，7926 × 9389 像素。
   - 预览图：public/reference/nwpu-changan-official-map-preview.jpg，1024 × 1213 像素。
   - 预览下载：https://peixun.nwpu.edu.cn/__local/9/90/A1/1EF5225A9E6FB25B50814709A2E_4B7BCF5A_459F5.jpg
   - 此图经与带罗盘的官方指南和 OSM 对照，方向为北上、东右。

2. 西工大国际学生招生指南，PDF 元数据为 2025-01-16，题名“25西工大国际交流画册（中文）.cdr”。
   - https://npuinternationalcollege.nwpu.edu.cn/__local/7/A6/38/BD9F70B9F5ECB51A24417715C4A_32F84F04_11BDA94.pdf
   - 本地 research/guide.pdf，24 个 PDF 页面。
   - 长安校区地图在 PDF 第 23 页（印刷页码 41–42），本地渲染图 public/reference/nwpu-changan-guide-map-2025.png。
   - 插画的罗盘是西上、北右、东下、南左。不得直接按北上坐标使用。
   - 图中编号：3 启翔楼，6 海天苑餐厅，7 海天苑学生公寓，8 海天苑大楼，15 启真楼，16 图书馆，18 翱翔游泳馆，21 星天苑田径场，22 教学西楼，25 教学东楼，32 翱翔体育馆，33 云天苑田径场，34 云天苑餐厅，35 云天苑学生公寓，36 翱翔学生中心，39 星天苑南餐厅，40 星天苑学生公寓，41 星天苑北餐厅。
   - 这是一幅带透视的导览插画，不适合直接测距。

3. 西北工业大学《建校86周年100张图片看西工大的历史变化》：https://www.nwpu.edu.cn/info/1198/92938.htm
   - 官方图片说明同时使用“启真湖”和“启翔湖”，确为两个不同名称。
   - 包含长安校区图书馆、翱翔体育馆、启翔楼、启真湖、启翔湖的照片，可用于后续人工校核外观。

4. 西工大体育部《长安校区翱翔体育馆》：https://tiyu.nwpu.edu.cn/info/1227/2299.htm
   - 名称为“翱翔体育馆”；不要误用 PDF 图像识别输出的“翔翔体育馆”。

## 建模建议

- 优先使用已取得的 OSM 经纬度建筑轮廓与道路几何；本文件没有改动 research/osm-*。
- 下附 JSON 坐标均为官方预览图片的人工读图近似：x 向右、y 向下，单位分别除以 1024 和 1213。它们适合匹配建筑身份与补充示意体块，不能冒充真实经纬度。
- 图书馆/启真楼：共享大体圆弧形西侧轮廓，东侧为宽阔轴线通道；图书馆在偏北一翼，启真楼在偏南一翼。标签对应由官方编号图匹配，尚需现场校核。
- 教学东楼：中央方形内院，西北与东南为围合翼楼，西南另有折线形附楼；不要用一个长方体替代全部群落。
- 启翔楼：北、东、南三面主体围合庭院，西侧有细连接廊和小方亭，主入口朝东。
- 海天苑大楼：南北向狭长、多庭院、左右两列翼楼与连接体。OSM 当前项为 landuse=construction，应以原型补充体块明确标为推定，不能当作已测绘建筑。
- 云天苑、星天苑等重复宿舍楼应主要依照 OSM 已有轮廓；官方旧总图东侧大片居住区和南部规划区与当前 OSM覆盖范围可能不同。
- 建筑层数、立面、材质、屋顶高度没有由此项研究核验，视觉模型采用合理示意，并在产品资料说明中披露。

## 下载与渲染

本机 PowerShell/urllib/curl 对这些域名曾遇到 TLS EOF。Node 自带 fetch 成功下载 peixun.nwpu.edu.cn 镜像与 npuinternationalcollege.nwpu.edu.cn 的 PDF。官网 www.nwpu.edu.cn 直接图下载返回 403，因此本地原图来自同校镜像。

PDF 通过 Poppler 的 pdftoppm 渲染，仅作参考检查。research/crop-*.png 是原图局部检查图，不是新制作的校园照片。


## 2026-10-18 南区纠错记录

后续核验以 `changan-south-audit-notes.md` 为准。旧版矩形筛选误收校外机电楼，南山苑又在展示底座外；建筑底面还统一抬高，已分别修复。海天苑运动场、航空宇航支撑中心补绘见 `changan-south-traces.json`。宿舍关系成员合并并保留楼翼连接；三期/四期精确落位仍未知，未虚构建筑。`changan-geometry-audit.json` 记录完整轮廓覆盖、建筑相交面积及运动场冲突核验。
