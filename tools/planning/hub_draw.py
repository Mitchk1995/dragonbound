"""Authored SVG plan and equal-scale terrain sections, from one checked layout."""
import base64
from html import escape
from io import BytesIO
import math
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image

from hub_geometry import (distance_to_line, inside, signed_distance, surface,
                          sample_line)

S, MX, MY = 6.1, 105, 148
INK, PAPER = "#3b4236", "#f7f1df"
ROOFS = {"tile":"#b86445","red":"#9c4f3e","slate":"#647b8e",
         "ochre":"#bd9160","shingle":"#8e8065"}


def point(p):
    return MX+S*p[0], MY+S*p[1]


def coords(poly):
    return " ".join(f"{x:.2f},{y:.2f}" for x,y in map(point,poly))


def path(line):
    return "M"+" L".join(f"{x:.2f},{y:.2f}" for x,y in map(point,line))


def text(x,y,s,size=23,colour=INK,weight="normal",anchor="middle",halo=True):
    h = f' stroke="{PAPER}" stroke-width="5" paint-order="stroke" stroke-linejoin="round"' if halo else ""
    return (f'<text x="{x:.1f}" y="{y:.1f}" fill="{colour}" font-family="Georgia, serif" '
            f'font-size="{size}" font-weight="{weight}" text-anchor="{anchor}"{h}>{escape(str(s))}</text>')


def label(p,s,size=24,colour=INK):
    x,y=point(p)
    return text(x,y,s,size,colour)


def poly(points,fill,stroke=INK,width=1.5,extra=""):
    return f'<polygon points="{coords(points)}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" {extra}/>'


def line(points,stroke,width,dash=None,extra=""):
    ds=f' stroke-dasharray="{dash}"' if dash else ""
    return f'<path d="{path(points)}" fill="none" stroke="{stroke}" stroke-width="{width}" stroke-linejoin="round" stroke-linecap="round"{ds} {extra}/>'


def header(title,subtitle,w,h):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">',
            f'<rect width="{w}" height="{h}" fill="{PAPER}"/>',
            '<rect width="1800" height="99" fill="#273b38"/>',
            text(66,62,title,39,"#f8ebcb","bold","start",False),
            text(1737,61,subtitle,22,"#d2d5b8","normal","end",False)]


def terrain_image(world):
    xs,zs = np.arange(0,261,1.3),np.arange(0,221,1.3)
    x,z=np.meshgrid(xs,zs)
    h=surface(world,x,z)
    dz,dx=np.gradient(h,1.3)
    light=np.clip((.7-dx*.8-dz*.55)/np.sqrt(1+dx*dx+dz*dz),.15,1.3)
    lo=np.array([179,202,143])
    hi=np.array([213,205,169])
    a=np.clip(h/43,0,1)[...,None]
    rgb=(lo*(1-a)+hi*a)*(light[...,None]*.22+.86)
    rock=signed_distance(world["crag"],x,z)<2
    rgb=np.where(rock[...,None],np.array([177,185,164])*(light[...,None]*.23+.78),rgb)
    rgb=np.clip(rgb,0,255).astype("uint8")
    image=Image.fromarray(rgb).resize((1586,1342),Image.Resampling.BICUBIC)
    buf=BytesIO()
    image.save(buf,format="PNG",optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii"),x,z,h


def contours(x,z,h,level):
    """Marching squares with a consistent diagonal at four-edge saddle cells."""
    seg=[]
    for j in range(h.shape[0]-1):
        for i in range(h.shape[1]-1):
            v=[h[j,i],h[j,i+1],h[j+1,i+1],h[j+1,i]]
            if min(v)>level or max(v)<level:
                continue
            p=[(x[j,i],z[j,i]),(x[j,i+1],z[j,i+1]),
               (x[j+1,i+1],z[j+1,i+1]),(x[j+1,i],z[j+1,i])]
            hits=[]
            for k in range(4):
                kk=(k+1)%4
                if (v[k]<level)!=(v[kk]<level):
                    f=(level-v[k])/(v[kk]-v[k])
                    hits.append((p[k][0]+f*(p[kk][0]-p[k][0]),
                                 p[k][1]+f*(p[kk][1]-p[k][1])))
            for k in range(0,len(hits)-1,2):
                seg.append((hits[k],hits[k+1]))
    return " ".join(path(p) for p in seg)


def arrow(a,b,colour,width=2):
    a,b=np.asarray(a,float),np.asarray(b,float)
    v=b-a
    n=np.linalg.norm(v)
    if n==0:
        return ""
    v/=n
    t=np.array([-v[1],v[0]])
    return line([a,b],colour,width)+poly([b,b-v*1.3+t*.6,b-v*1.3-t*.6],colour,colour,.5)


def tree(p,r=2.3,orchard=False):
    x,y=point(p)
    colour="#78984f" if orchard else "#688864"
    shape=[]
    for i in range(12):
        ang=i*math.pi/6
        rad=r*(.96+.1*math.sin(i*3.1+p[0]))
        shape.append((x+S*rad*math.cos(ang),y+S*rad*math.sin(ang)))
    pstr=" ".join(f"{a:.1f},{b:.1f}" for a,b in shape)
    return (f'<ellipse cx="{x+4:.1f}" cy="{y+5:.1f}" rx="{S*r:.1f}" ry="{S*r*.86:.1f}" fill="#536447" opacity=".18"/>'
            f'<polygon points="{pstr}" fill="{colour}" stroke="#52664d" stroke-width="1.4"/>'
            f'<circle cx="{x-3:.1f}" cy="{y-4:.1f}" r="{S*r*.54:.1f}" fill="#9bb66b" opacity=".58"/>'
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="2" fill="#435538"/>')


def woods(world):
    out=[]
    for j,z in enumerate(range(7,176,9)):
        for i,x in enumerate(list(range(5,25,9))+list(range(227,261,9))):
            p=(x+math.sin(i*3+j)*3.3,z+math.cos(i+j*2)*3.4)
            r=2.4+.4*math.sin(i+j)
            if signed_distance(world["crag"],*p)<r+2:
                continue
            if any(distance_to_line(st["line"],*p)[0]<r+st["width"]/2+1 for st in world["streets"]):
                continue
            if distance_to_line(world["burn"],*p)[0]<r+4:
                continue
            if signed_distance(world["orchard"],*p)<r+2:
                continue
            out.append(tree(p,r))
    for x in (27,35,43):
        for z in (108,116,124,132):
            if signed_distance(world["orchard"],x,z)<-2.5:
                out.append(tree((x,z),2.1,True))
    return out


def roof(lot,i):
    out=[]
    b,t,n,c,w,d=lot["building"],lot["t"],lot["n"],lot["c"],lot["width"],lot["depth"]
    out.append(poly(lot["parcel"],"#cfcdab","#738064",1.7))
    # Back edge is a retaining garden wall, not a disconnected lawn symbol.
    out.append(line([lot["parcel"][2],lot["parcel"][3]],"#626d58",3))
    out.append(line([lot["road"],lot["door"]],"#eadac0",S*1.2))
    out.append(poly([np.asarray(p)+(.6,.6) for p in b],"#514331","none",0,extra='opacity=".16"'))
    out.append(poly(b,ROOFS[lot["roof"]],"#55483c",2.1))
    if lot["form"]=="court":
        a=np.asarray(b[0])
        out.append(line([a+t*.5+n*d*.27,a+t*(w-.5)+n*d*.27],"#623f35",2.1))
        out.append(line([a+t*(w*.31)+n*d*.28,a+t*(w*.31)+n*(d-.5)],"#623f35",2.1))
    else:
        out.append(line([c-t*(w/2-.4),c+t*(w/2-.4)],"#513f36",2))
        front=[c-t*w/2-n*d/2,c+t*w/2-n*d/2,c+t*w/2,c-t*w/2]
        out.append(poly(front,"#f4dba6","none",0,extra='opacity=".14"'))
    dp=lot["door"]
    out.append(line([dp-t*.9,dp+t*.9],"#f1e2c4",3.4))
    chimney=c+t*(w*.28)+n*(d*(-.24 if lot["form"]=="court" else .24))
    out.append(poly([chimney-t*.5-n*.5,chimney+t*.5-n*.5,
                     chimney+t*.5+n*.5,chimney-t*.5+n*.5],"#574b40","#e5d0ac",.8))
    return out


def road_svg(st):
    line_=st["line"]
    if st["kind"]=="stairs":
        out=[line(line_,"#5e6757",S*(st["width"]+.65)),
             line(line_,"#e3d9bd",S*st["width"])]
        distances=np.r_[0,np.cumsum(np.linalg.norm(np.diff(line_,axis=0),axis=1))]
        # Risers grouped into flights with clear landings every twelve treads.
        for k,s in enumerate(np.arange(.6,distances[-1]-.3,.72)):
            if k%14 in (12,13):
                continue
            i=min(np.searchsorted(distances,s)-1,len(line_)-2)
            f=(s-distances[i])/(distances[i+1]-distances[i])
            p=line_[i]*(1-f)+line_[i+1]*f
            t=line_[i+1]-line_[i]
            t=t/np.linalg.norm(t)
            n=np.array([-t[1],t[0]])
            out.append(line([p-n*st["width"]*.48,p+n*st["width"]*.48],"#7d8271",1.1))
        a,b=line_[len(line_)//3],line_[min(len(line_)-1,len(line_)//3+5)]
        if st["heights"][-1]<st["heights"][0]:
            a,b=b,a
        out.append(arrow(a,b,"#9b5233",2.5))
        return out
    border="#777961" if st["kind"]!="lane" else "#9a916d"
    fill="#efe2c6" if st["kind"]!="lane" else "#d6c59f"
    out=[line(line_,border,S*(st["width"]+.45)),
         line(line_,fill,S*st["width"])]
    if st["kind"]=="bridge":
        for n in (-1,1):
            p=line_
            v=(p[-1]-p[0])/np.linalg.norm(p[-1]-p[0])
            normal=np.array([-v[1],v[0]])
            out.append(line(p+normal*n*st["width"]*.44,"#66715f",2.4))
    return out


def badge(p,n):
    x,y=point(p)
    return (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="16" fill="#f4ce75" stroke="#6c5b3a" stroke-width="2"/>'
            +text(x,y+6,n,21,"#463c2b","bold",halo=False))


def draw_plan(world):
    out=header("RISING HILLSIDE","ONE DRAWN PLAN · PENDING",1800,1600)
    out.append(f'<defs><clipPath id="map-crop"><rect x="{MX}" y="{MY}" width="{260*S}" height="{220*S}"/></clipPath></defs>')
    out.append('<g clip-path="url(#map-crop)">')
    image,x,z,h=terrain_image(world)
    out.append(f'<image x="{MX}" y="{MY}" width="{S*260}" height="{S*220}" href="data:image/png;base64,{image}"/>')
    for level in range(2,46,2):
        out.append(f'<path d="{contours(x,z,h,level)}" fill="none" stroke="#7f886a" stroke-width="{1.6 if level%6==0 else .7}" opacity="{.65 if level%6==0 else .40}"/>')
    out.append(poly(world["orchard"],"#c4cc8f","#71816a",2.2))
    for a,b in zip(world["crag"],world["crag"][1:]+[world["crag"][0]]):
        a,b=np.asarray(a,float),np.asarray(b,float)
        t=(b-a)/np.linalg.norm(b-a)
        n=np.array([t[1],-t[0]])
        for f in np.arange(.1,.94,.12):
            p=a*(1-f)+b*f
            out.append(line([p,p+n*3.1],"#697465",1.9))
    out.append(poly(world["crag"],"none","#657568",3))
    # One catchment stream, physically connected to the downstream river.
    for name,width in [("river",11.4),("burn",4.1)]:
        water=world[name]
        out.append(line(water,"#7e9b85",S*(width+1.8)))
        out.append(line(water,"#6b9aab",S*width))
        out.append(line(water,"#a3c6ca",S*width*.66,extra='opacity=".55"'))
        for j in range(12,len(water)-6,26):
            out.append(arrow(water[j],water[j+5],"#e2eeee",1.4))
    out.append(poly(world["market"],"#e8dcc0","#7f826b",2.0))
    for lot in world["lots"]:
        out.append(poly(lot["parcel"],"#cfd0ae","#778063",1.8))
    portal=world["portal"]
    out.append(poly(portal["poly"],"#d8dccb","#6e7d6e",2.3))
    out.append(line([portal["road"],portal["front"]],"#e6dcc2",S*2.4))
    for st in world["streets"]:
        out.extend(road_svg(st))
    out.append(line([(51,121),(54,124)],"#ead9b8",S*1.2))
    out.append(line([(51,120),(51,122)],"#715e43",2.3))
    out.extend(woods(world))
    for i,lot in enumerate(world["lots"]):
        out.extend(roof(lot,i))
    c=portal["c"]
    for i in range(6):
        angle=math.radians(i*55-20)
        p=c+np.array([math.cos(angle),math.sin(angle)])*6.0
        t=np.array([-math.sin(angle),math.cos(angle)])
        n=np.array([math.cos(angle),math.sin(angle)])
        out.append(poly([p-t*1.35-n*.45,p+t*1.35-n*.45,p+t*1.35+n*.45,p-t*1.35+n*.45],
                        "#afb9ad","#596b68",1.5))
    cx,cy=point(c)
    out.append(f'<circle cx="{cx}" cy="{cy}" r="{S*3.9}" fill="none" stroke="#9cbdbd" stroke-width="2.2"/>')
    # The open market stays open; stalls are at its edge, never across a route.
    for p,ang in [((138,118),-.4),((143,118),-.5),((116,118),1.2)]:
        t=np.array([math.cos(ang),math.sin(ang)])
        n=np.array([-t[1],t[0]])
        centre=np.asarray(p)
        out.append(poly([centre-t*1.1-n*.6,centre+t*1.1-n*.6,
                         centre+t*1.1+n*.6,centre-t*1.1+n*.6],"#ad7051","#73563f",1.2))
    fx,fy=point((130,121))
    out.append(f'<circle cx="{fx}" cy="{fy}" r="{S*1.5}" fill="#8cadad" stroke="#e9e4d3" stroke-width="4"/>')
    # A genuine reserved summit; no castle footprint or built alternative.
    out.append(label((72,29),"Castle reserve",32))
    out.append(label((72,36),"+44 m crest",25))
    out.append(label((72,42),"Design comes later",19))
    out.append(label((35,94),"Apple orchard",25))
    out.append(label((200,119),"Stream ravine",24))
    out.append(label((213,132),"Downhill to river",20))
    out.append(label((88,155),"River approach",23))
    out.append(label((100,211),"Open water meadow",24))
    out.append(label((133,125),"Market court",21))
    out.append(label((133,130),"+18.5 m court",18))
    # Elevation callouts show the slope through the occupied town itself.
    for p,lab,near,road in [((78,82),"Upper street",(85,76),0),
                           ((66,105),"Market street",(68,97),0),
                           ((72,136),"Lower street",(84,131),0),
                           ((164,179),"River walk",(161,172),1),
                           ((139,207),"South road",(139,207),4)]:
        st=world["streets"][road]
        v=float(sample_line(st["line"],st["heights"],near)[2])
        out.append(label(p,lab,20))
        out.append(label((p[0],p[1]+3.5),f"{v:+.0f} m",18))
    roles=[("Counting House",1),("Supply Shop",2),("Forge Court",3),
           ("Riverside Inn",4),("Bakery",5)]
    for name,n in roles:
        lot=next(p for p in world["lots"] if p["id"]==name)
        out.append(badge(lot["c"],n))
    out.append(badge(c,6))
    # Sections are registered to these exact lines; symbols sit outside the map.
    out.append(line([(91,5),(91,215)],"#a65e48",1.7,"10 6",extra='opacity=".72"'))
    out.append(line([(4,106),(256,106)],"#a65e48",1.7,"10 6",extra='opacity=".72"'))
    for p,s in [((91,3),"A"),((91,217),"A"),((2,106),"B"),((258,106),"B")]:
        px,py=point(p)
        out.append(f'<circle cx="{px}" cy="{py}" r="14" fill="#a65e48"/>')
        out.append(text(px,py+6,s,20,"#fff4df","bold",halo=False))
    nx,ny=point((248,206))
    out.append(text(nx,ny-32,"N",23))
    out.append(arrow((248,211),(248,201),"#3d5046",3))
    # Scale and compact keys; pictures do not carry a prose design essay.
    sx,sy=point((6,212))
    for k in range(4):
        out.append(f'<rect x="{sx+k*10*S}" y="{sy}" width="{10*S}" height="8" fill="{"#465044" if k%2==0 else PAPER}"/>')
    out.append(text(sx,sy-8,"0",17,anchor="start"))
    out.append(text(sx+40*S,sy-8,"40 metres",17,anchor="end"))
    out.append(f'<rect x="{MX}" y="{MY}" width="{260*S}" height="{220*S}" fill="none" stroke="#687560" stroke-width="1.5"/>')
    out.append("</g>")
    for i,(n,lab) in enumerate([(1,"Town bank"),(2,"Supply shop"),(3,"Forge court"),
                              (4,"Quest inn"),(5,"Approved bakery"),(6,"Portal court")]):
        x0=86+i*278
        out.append(f'<circle cx="{x0}" cy="1537" r="13" fill="#f4ce75" stroke="#6c5b3a" stroke-width="1.5"/>')
        out.append(text(x0,1542,n,18,"#463c2b","bold",halo=False))
        out.append(text(x0+24,1544,lab,23,anchor="start",halo=False))
    out.append(text(70,1580,"Contours every 2 m",19,anchor="start",halo=False))
    out.append(text(1730,1580,"Doors face connected streets · terraced plots · no game construction",19,anchor="end",halo=False))
    out.append("</svg>")
    return "\n".join(out)


def section_profile(world,a,b,origin,scale):
    a,b=np.asarray(a,float),np.asarray(b,float)
    length=np.linalg.norm(b-a)
    ts=np.linspace(0,1,int(length*4)+1)
    points=a[None,:]+(b-a)[None,:]*ts[:,None]
    h=surface(world,points[:,0],points[:,1])
    ox,oy=origin
    shape=[(ox,oy+45)]+[(ox+t*length*scale,oy-v*scale) for t,v in zip(ts,h)]+[(ox+length*scale,oy+45)]
    ps=" ".join(f"{x:.2f},{y:.2f}" for x,y in shape)
    out=[f'<polygon points="{ps}" fill="#d6ceb3" stroke="none"/>']
    crest=" ".join(f"{ox+t*length*scale:.2f},{oy-v*scale:.2f}" for t,v in zip(ts,h))
    out.append(f'<polyline points="{crest}" fill="none" stroke="#667558" stroke-width="3"/>')
    for lot in world["lots"]:
        mask=inside(lot["building"],points[:,0],points[:,1])
        if not np.any(mask):
            continue
        low,high=np.flatnonzero(mask)[[0,-1]]
        x0,x1=ox+ts[low]*length*scale,ox+ts[high]*length*scale
        floor=oy-lot["floor"]*scale
        eaves=floor-(lot["storeys"]*3.05+.75)*scale
        top=eaves-3.1*scale
        silhouette=[(x0,floor),(x0,eaves),((x0+x1)/2,top),(x1,eaves),(x1,floor)]
        pstr=" ".join(f"{x:.2f},{y:.2f}" for x,y in silhouette)
        out.append(f'<polygon points="{pstr}" fill="#e5d7b9" stroke="#696658" stroke-width="1.6"/>')
        roofpts=f"{x0},{eaves} {(x0+x1)/2},{top} {x1},{eaves}"
        out.append(f'<polygon points="{roofpts}" fill="{ROOFS[lot["roof"]]}" stroke="#625548" stroke-width="1.4"/>')
        for k in range(lot["storeys"]):
            out.append(f'<rect x="{(x0+x1)/2-2}" y="{floor-(k+1)*3.05*scale}" width="4" height="8" fill="#6c796f"/>')
    for key,width in [("river",5.7),("burn",2.05)]:
        dist,_,_ = distance_to_line(world[key],points[:,0],points[:,1])
        water = .84-.006*points[:,0] if key=="river" else .18*(197-points[:,1])+.84-.006*215
        mask=(dist<width)&(h<water)
        if np.any(mask):
            low,high=np.flatnonzero(mask)[[0,-1]]
            shape=[(ox+ts[low]*length*scale,oy-water[low]*scale)]
            shape += [(ox+ts[k]*length*scale,oy-h[k]*scale) for k in range(low,high+1)]
            shape += [(ox+ts[high]*length*scale,oy-water[high]*scale)]
            pstr=" ".join(f"{x:.2f},{y:.2f}" for x,y in shape)
            out.append(f'<polygon points="{pstr}" fill="#81adb8" opacity=".9"/>')
    return out,points,h,length


def draw_sections(world):
    out=header("HILLSIDE SECTIONS","SAME PLAN · TRUE SCALE",1800,1300)
    # A is the exact north/south line x=91 on the plan, not a projected montage.
    out.append(text(83,154,"A · Hill to river",30,weight="bold",anchor="start",halo=False))
    ox,oy,scale=90,560,7.1
    elems,points,heights,length=section_profile(world,(91,5),(91,215),(ox,oy),scale)
    out.extend(elems)
    for level in (0,12,24,36,44):
        yy=oy-level*scale
        out.append(f'<line x1="77" y1="{yy}" x2="1690" y2="{yy}" stroke="#8f9681" stroke-width=".8" stroke-dasharray="5 6" opacity=".5"/>')
        out.append(text(69,yy+5,f"+{level}",16,anchor="end",halo=False))
    for z,lab in [(29,"Castle reserve"),(78,"Upper street"),(100,"Market street"),
                  (133,"Lower street"),(168,"River walk"),(184,"River channel")]:
        p=(91,z)
        v=float(surface(world,*p))
        if lab=="River channel":
            v=.84-.006*91
        px=ox+(z-5)*scale
        py=oy-v*scale
        targety=200 if z<43 else (300 if lab=="Market street" else (355 if z<140 else 440))
        out.append(f'<line x1="{px}" y1="{py-7}" x2="{px}" y2="{targety+9}" stroke="#8a927b" stroke-width="1.2"/>')
        labelx = px + (35 if lab=="River channel" else (-25 if lab=="River walk" else 0))
        out.append(text(labelx,targety,lab,21))
        out.append(text(labelx,targety+25,f"{v:+.1f} m",18))
    for z in (78,100,133,168):
        v=float(surface(world,91,z))
        x0=ox+(z-5)*scale
        y0=oy-v*scale
        out.append(f'<circle cx="{x0+6}" cy="{y0-13}" r="2.3" fill="#566555"/>')
        out.append(f'<path d="M{x0+6},{y0-11} v7 m-3,4 l3,-4 l3,4" fill="none" stroke="#566555" stroke-width="1.8"/>')
    out.append(text(1645,625,"Horizontal = vertical",21,anchor="end",halo=False))
    out.append(text(90,625,"NORTH",18,anchor="start",halo=False))
    out.append(text(1530,595,"SOUTH",18,anchor="end",halo=False))
    # B crosses the occupied hillside, orchard, steep-sided stream and east slope.
    out.append(text(83,730,"B · Across the hillside",30,weight="bold",anchor="start",halo=False))
    ox,oy,scale=90,1110,6.1
    elems,points,heights,length=section_profile(world,(4,106),(256,106),(ox,oy),scale)
    out.extend(elems)
    for level in (0,12,24):
        yy=oy-level*scale
        out.append(f'<line x1="77" y1="{yy}" x2="1690" y2="{yy}" stroke="#8f9681" stroke-width=".8" stroke-dasharray="5 6" opacity=".5"/>')
        out.append(text(69,yy+5,f"+{level}",16,anchor="end",halo=False))
    for x,lab in [(34,"Apple orchard"),(62,"Contour street"),(119,"Market terrace"),
                  (208,"Stream ravine"),(246,"East hillside")]:
        v=float(surface(world,x,106))
        px=ox+(x-4)*scale
        py=oy-v*scale
        out.append(f'<line x1="{px}" y1="{py-7}" x2="{px}" y2="835" stroke="#8a927b" stroke-width="1.2"/>')
        out.append(text(px,815,lab,21))
        out.append(text(px,840,f"{v:+.1f} m",18))
    out.append(text(90,1175,"WEST",18,anchor="start",halo=False))
    out.append(text(1630,1175,"EAST",18,anchor="end",halo=False))
    out.append(text(90,1245,"Narrow terraces · retaining walls · stair shortcuts",23,anchor="start",halo=False))
    out.append(text(1710,1245,"Drawn proposal · not built",23,anchor="end",halo=False))
    out.append("</svg>")
    return "\n".join(out)


def render(svg,png,size,scratch):
    chrome=Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    if not chrome.is_file():
        raise FileNotFoundError("Chrome is required only to rasterise the authored SVG")
    profile=scratch/"chrome-profile"
    subprocess.run([str(chrome),"--headless=new","--disable-gpu","--hide-scrollbars",
                    "--force-device-scale-factor=1",f"--user-data-dir={profile}",
                    f"--window-size={size[0]},{size[1]}",f"--screenshot={png}",
                    svg.as_uri()],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                   timeout=45)
    with Image.open(png) as image:
        if image.size!=size:
            raise ValueError(f"Raster size differs from authored SVG: {image.size}")
