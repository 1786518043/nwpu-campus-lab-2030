from pathlib import Path
import json
from PIL import Image,ImageDraw,ImageFont
root=Path('.');out=root/'research'
font='C:/Windows/Fonts/msyh.ttc'
f=ImageFont.truetype(font,22);sm=ImageFont.truetype(font,18);big=ImageFont.truetype(font,30)
data=json.load(open('src/data/campus.json',encoding='utf8'))
W,H=1800,1740;canvas=Image.new('RGB',(W,H),'#f5f7fa');d=ImageDraw.Draw(canvas)
d.text((25,12),'海天苑 4 号楼（三期）方位复核｜邻接关系核对，非摄影测量成果',font=big,fill='#172538')
# photograph annotation
im=Image.open('public/reference/changan-south/phase3-2026-21.jpg').convert('RGB');im.thumbnail((1160,655));canvas.paste(im,(20,65));p=ImageDraw.Draw(canvas)
scale=im.width/2048
for label,xy,box,col in [
 ('A 留学生公寓西面连接体',(235,390),(35,620),'#ffdf68'),
 ('B 1号组群：四排旧楼/绿色屋面',(1160,170),(660,110),'#ffd36e'),
 ('C 远处 2号组群蓝阳台端部',(650,67),(590,35),'#80d5ff'),
 ('D 启翔湖方向',(85,80),(40,35),'#92e6ff')]:
 q=(20+xy[0]*scale,65+xy[1]*scale); t=(20+box[0]*scale,65+box[1]*scale)
 bb=p.textbbox(t,label,font=sm);p.rectangle((bb[0]-4,bb[1]-2,bb[2]+4,bb[3]+2),fill='#152636');p.text(t,label,font=sm,fill=col);p.line((q[0],q[1],t[0]+10,t[1]+25),fill=col,width=3);p.ellipse((q[0]-5,q[1]-5,q[0]+5,q[1]+5),fill=col)
p.text((30,im.height+75),'2026 年移交航拍：4号楼前景；近似朝南，图左为东。字母表示识别区域，不是已测控制点。',font=sm,fill='#27364a')
# map on right
box=(1200,70,1780,1000);p.rounded_rectangle(box,fill='white',outline='#ccd4df',radius=12)
S=13.5; ox=1225;oy=105
uv=lambda point:(ox+(point[0]+58)*S,oy+(point[1]+5)*S)
for z in range(0,51,10):
 y=uv((-58,z))[1];p.line((1220,y,1770,y),fill='#d7dce4');p.text((1225,y+2),f'z={z}',font=sm,fill='#6e7a8b')
for b in data['buildings']:
 pts=b['points'];cx=sum(q[0] for q in pts)/len(pts);cz=sum(q[1] for q in pts)/len(pts)
 if -57<cx<-21 and -6<cz<50 and str(b['id']).startswith(('r','w')):
  col='#b5c3dc';ident=str(b['id'])
  if ident.startswith('r14477262'):col='#e5ba51'
  if ident.startswith('r14477263'):col='#68a0dd'
  if ident.startswith('r14477260'):col='#8dbca5'
  p.polygon([uv(q) for q in pts],fill=col,outline='#476174')
  for hole in b.get('holes',[]):p.polygon([uv(q) for q in hole],fill='white',outline='#476174')
# Candidate, not dimensions
v0=uv((-49,0));v1=uv((-38,8));p.rectangle((*v0,*v1),outline='#d34f5a',width=4)
p.text((v0[0]+4,v0[1]+25),'三期候选范围',font=sm,fill='#b62835')
for label,point in [('A 留学生公寓',(-36,3)),('B 1号组群',(-47,16)),('C 2号组群',(-36,36)),('四期：二期西侧',(-51,39)),('北 ↑',(-27,-3))]:
 q=uv(point);p.text(q,label,font=sm,fill='#25364c')
p.text((1215,895),'x 向东，z 向南；1 单位约 10 米',font=sm,fill='#364556')
p.text((1215,925),'红框：近似定位区，不是楼体轮廓/地界',font=sm,fill='#b62835')
# 2022 render
rend=Image.open('public/reference/changan-south/phase3-location-2022-feasibility.jpg').convert('RGB');rend.thumbnail((740,555));canvas.paste(rend,(20,790))
p.text((790,1030),'复核链条',font=big,fill='#172538')
lines=[
 '1. 建筑牌证实“三期 = 海天苑4号楼”；2026年已投用。',
 '2. 航拍东侧邻楼的两翼+西侧中央连接体，与留学生公寓',
 '   r14477262 的 OSM 轮廓相符。',
 '3. 航拍南侧四排旧楼与1号组群四条东西向楼翼相符；',
 '   再南方可见2号组群与四期施工塔吊；湖位于东南侧。',
 '4. 2022 可研效果图亦有东侧公寓和南侧旧楼两组邻接。',
 '5. 对应地块在1号北侧、留学生公寓西侧，候选',
 '   x≈[-49,-38]，z≈[0,8]。建筑两主翼近东西向。',
 '',
 '不能由倾斜照片直接套地面单应矩阵：屋顶高度不同，',
 '且若干基脚被遮挡。红框只供原型近似复原，不应称',
 '为测绘控制点、用地红线、竣工图或精确面积。',
 '',
 '左图：2022 可研效果图，设计阶段，不代表竣工尺寸。',
 '公开来源 URL、检索限制与 OSM 坐标见同名 notes.md。'
]
for i,line in enumerate(lines):p.text((790,1080+i*31),line,font=sm,fill='#33445c')
canvas.save(out/'phase3-location-evidence-board.jpg',quality=93)

