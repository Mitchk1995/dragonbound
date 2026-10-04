"""Spatial constraints for the paper plan, independent of its SVG presentation."""
import math

import numpy as np


def smooth_line(points, spacing=.9):
    p = np.asarray(points, float)
    out = []
    for i in range(len(p)-1):
        a, b = p[i], p[i+1]
        m0 = (b - p[max(0, i-1)]) * .3
        m1 = (p[min(len(p)-1, i+2)] - a) * .3
        count = max(3, int(np.linalg.norm(b-a)/spacing))
        for t in np.linspace(0, 1, count, endpoint=False):
            out.append((2*t**3-3*t**2+1)*a+(t**3-2*t**2+t)*m0
                       +(-2*t**3+3*t**2)*b+(t**3-t**2)*m1)
    out.append(p[-1])
    return np.array(out)


def distance_to_line(line, x, z):
    x, z = np.broadcast_arrays(np.asarray(x, float), np.asarray(z, float))
    best = np.full(x.shape, np.inf)
    which = np.zeros(x.shape, dtype=int)
    fraction = np.zeros(x.shape)
    for i, (a, b) in enumerate(zip(line[:-1], line[1:])):
        v = b-a
        length = float(v@v)
        t = np.clip(((x-a[0])*v[0]+(z-a[1])*v[1])/length, 0, 1)
        d = (x-a[0]-v[0]*t)**2 + (z-a[1]-v[1]*t)**2
        mask = d < best
        best, which, fraction = np.where(mask,d,best), np.where(mask,i,which), np.where(mask,t,fraction)
    return np.sqrt(best), which, fraction


def sample_line(line, heights, near):
    _, i, f = distance_to_line(line, *near)
    i, f = int(i), float(f)
    v = line[i+1]-line[i]
    return line[i]+v*f, v/np.linalg.norm(v), heights[i]*(1-f)+heights[i+1]*f


def inside(poly, x, z):
    x, z = np.broadcast_arrays(np.asarray(x,float),np.asarray(z,float))
    result = np.zeros(x.shape, bool)
    for a, b in zip(poly, list(poly[1:])+[poly[0]]):
        ax, az = a
        bx, bz = b
        if abs(bz-az) > 1e-12:
            result ^= ((az>z)!=(bz>z)) & (x < (bx-ax)*(z-az)/(bz-az)+ax)
    return result


def signed_distance(poly, x, z):
    closed = np.array(list(poly)+[poly[0]])
    d, _, _ = distance_to_line(closed,x,z)
    return np.where(inside(poly,x,z), -d, d)


def rectangle(c, t, n, w, d):
    return [c-t*w/2-n*d/2, c+t*w/2-n*d/2,
            c+t*w/2+n*d/2, c-t*w/2+n*d/2]


def parcel(front, t, n, w, d):
    return [front-t*w/2,front+t*w/2,front+t*w/2+n*d,front-t*w/2+n*d]


def route_samples(road, spacing=.1):
    """Include every authored vertex and sample each segment at bounded spacing."""
    line, heights = road["line"], road["heights"]
    points, levels = [], []
    for i, (a, b) in enumerate(zip(line[:-1], line[1:])):
        ts = np.linspace(0, 1, max(1, math.ceil(np.linalg.norm(b-a)/spacing)),
                         endpoint=False)
        points.extend(a+(b-a)*t for t in ts)
        levels.extend(heights[i]+(heights[i+1]-heights[i])*ts)
    return np.array(points+[line[-1]]), np.r_[levels, heights[-1]]


def route_junctions(a, b):
    """Exact centreline crossings, including shared endpoints."""
    p, v = a[:-1, None, :], np.diff(a, axis=0)[:, None, :]
    q, w = b[None, :-1, :], np.diff(b, axis=0)[None, :, :]
    cross = lambda u, v: u[..., 0]*v[..., 1]-u[..., 1]*v[..., 0]
    den = cross(v, w)
    safe = np.where(np.abs(den)>1e-12, den, 1)
    t, u = cross(q-p, w)/safe, cross(q-p, v)/safe
    valid = (np.abs(den)>1e-12)&(t>=-1e-9)&(t<=1+1e-9)&(u>=-1e-9)&(u<=1+1e-9)
    crossings = p+v*np.clip(t, 0, 1)[..., None]
    points = list(crossings[valid])
    for endpoint in (a[0], a[-1], b[0], b[-1]):
        if float(distance_to_line(a, *endpoint)[0])<1e-8 and float(distance_to_line(b, *endpoint)[0])<1e-8:
            points.append(endpoint)
    return np.unique(np.round(points, 9), axis=0) if points else np.empty((0, 2))


def reconcile_routes(world):
    """All crossing routes use the same elevation at their shared junction.

    Keep the High Street profile and every route footprint. Joining profiles use
    exact crossing knots, then grade back to their own ground. Stairs also land
    on the market terrace, and bridge endpoints
    share the street datum while the deck remains above the river.
    """
    previous = []
    for road in world["streets"]:
        if road["id"] == "High Street":
            previous.append(road)
            continue
        line, heights = road["line"], road["heights"]
        chain = np.r_[0, np.cumsum(np.linalg.norm(np.diff(line, axis=0), axis=1))]
        anchors = []
        for primary in previous:
            for p in route_junctions(line, primary["line"]):
                _, i, f = distance_to_line(line, *p)
                station = chain[int(i)]+float(f)*(chain[int(i)+1]-chain[int(i)])
                anchors.append((station, float(sample_line(primary["line"], primary["heights"], p)[2])))
        if road["kind"] == "stairs":
            reference = {**world, "streets": previous}
            for endpoint in (0, len(line)-1):
                if not any(abs(s-chain[endpoint])<1e-7 for s, _ in anchors):
                    anchors.append((chain[endpoint], float(surface(reference, *line[endpoint]))))
        stations = np.unique(np.r_[chain, [s for s, _ in anchors]])
        line = np.column_stack([np.interp(stations, chain, line[:, axis]) for axis in (0, 1)])
        heights = np.interp(stations, chain, heights)
        chain, fixed = stations, np.zeros(len(stations), bool)
        for station, level in anchors:
            i = int(np.argmin(np.abs(chain-station)))
            if not fixed[i]:
                heights[i], fixed[i] = level, True
        if road["kind"] == "stairs":
            knots = np.flatnonzero(fixed)
            heights = np.interp(chain, chain[knots], heights[knots])
        elif road["kind"] == "bridge":
            heights = np.interp(chain, [0, chain[-1]], [heights[0], heights[-1]])
        else:
            limit = .17 if road["kind"] == "street" else .35
            steps = np.diff(chain)*limit
            for _ in range(2):
                for i in range(1, len(heights)):
                    if not fixed[i]:
                        heights[i] = np.clip(heights[i], heights[i-1]-steps[i-1], heights[i-1]+steps[i-1])
                for i in range(len(heights)-2, -1, -1):
                    if not fixed[i]:
                        heights[i] = np.clip(heights[i], heights[i+1]-steps[i], heights[i+1]+steps[i])
        road["line"], road["heights"] = line, heights
        previous.append(road)


def surface(world, x, z):
    x, z = np.broadcast_arrays(np.asarray(x,float), np.asarray(z,float))
    h = world["ground"](x,z)
    mh = 18.5 - .03*(z-116) + .008*(x-128)
    h = np.where(inside(world["market"],x,z),mh,h)
    for lot in world["lots"]:
        h = np.where(inside(lot["parcel"],x,z),lot["floor"]-.1,h)
        access = np.array([lot["road"],lot["door"]])
        d,i,f = distance_to_line(access,x,z)
        h = np.where(d<.6,lot["floor"]-.1+.1*f,h)
    portal = world["portal"]
    if portal is not None:
        h = np.where(inside(portal["poly"],x,z),portal["floor"]-.1,h)
    # One shared road surface, independent of list order. Inverse-distance
    # weights preserve each route's exact centreline profile and converge to
    # the common knot elevation at crossings. Road benches cover door strips.
    weights, levels, uncovered = np.zeros(x.shape), np.zeros(x.shape), np.ones(x.shape)
    for road in world["streets"]:
        if road["kind"] == "bridge":
            continue
        d, i, f = distance_to_line(road["line"],x,z)
        rh = road["heights"][i]*(1-f)+road["heights"][i+1]*f
        blend = np.clip((road["width"]/2+1.5-d)/1.5,0,1)
        weight = blend/np.maximum(d, 1e-12)**2
        weights += weight
        levels += rh*weight
        uncovered *= 1-blend
    road_h = levels/np.maximum(weights, 1e-12)
    h = h*uncovered+road_h*(1-uncovered)
    return h


def edges(poly):
    return zip(poly,list(poly[1:])+[poly[0]])


def segment_distance(a,b,c,d):
    a,b,c,d = (np.asarray(q,float) for q in [a,b,c,d])
    def cross(u,v):
        return float(u[0]*v[1]-u[1]*v[0])
    v, w = b-a, d-c
    den = cross(v,w)
    if abs(den)>1e-10:
        t, u = cross(c-a,w)/den,cross(c-a,v)/den
        if -1e-9<=t<=1+1e-9 and -1e-9<=u<=1+1e-9:
            return 0.0
    def pd(p,a,b):
        v = b-a
        t = np.clip(float((p-a)@v)/max(float(v@v),1e-12),0,1)
        return float(np.linalg.norm(p-a-v*t))
    return min(pd(a,c,d),pd(b,c,d),pd(c,a,b),pd(d,a,b))


def polygon_distance(a,b):
    if inside(a,*b[0]) or inside(b,*a[0]):
        return 0.0
    return min(segment_distance(p,q,r,s) for p,q in edges(a) for r,s in edges(b))


def polygon_line_distance(poly,line):
    arr=np.asarray(line,float)
    if np.any(inside(poly,arr[:,0],arr[:,1])):
        return 0.0
    return line_distance(np.array(list(poly)+[poly[0]]),arr)


def line_distance(a,b):
    """Exact segment intersections and distances, batched rather than sampled."""
    a,b=np.asarray(a,float),np.asarray(b,float)
    p,v=a[:-1,None,:],np.diff(a,axis=0)[:,None,:]
    q,w=b[None,:-1,:],np.diff(b,axis=0)[None,:,:]
    delta=q-p
    cross=lambda u,v: u[...,0]*v[...,1]-u[...,1]*v[...,0]
    den=cross(v,w)
    safe=np.where(np.abs(den)>1e-12,den,1)
    t,u=cross(delta,w)/safe,cross(delta,v)/safe
    if np.any((np.abs(den)>1e-12)&(t>=0)&(t<=1)&(u>=0)&(u<=1)):
        return 0.0
    def pd(point,start,direction):
        f=np.clip(np.sum((point-start)*direction,axis=-1)/
                  np.maximum(np.sum(direction*direction,axis=-1),1e-12),0,1)
        return np.sum((point-start-f[...,None]*direction)**2,axis=-1)
    squared=np.minimum.reduce([pd(p,q,w),pd(p+v,q,w),pd(q,p,v),pd(q+w,p,v)])
    return float(np.sqrt(np.min(squared)))

def check_layout(world):
    failures = []
    roofs, parcels = [], []
    street_clearance, water_clearance = [], []
    lots = world["lots"]
    reserved = [(p["id"],p["parcel"]) for p in lots]+[("Portal Court",world["portal"]["poly"])]
    for i,(name,poly) in enumerate(reserved):
        for other,op in reserved[i+1:]:
            d = polygon_distance(poly,op)
            parcels.append(d)
            if d<.25:
                failures.append(f"Parcels touch or overlap: {name} / {other} ({d:.2f}m)")
        for road in world["streets"]:
            d = polygon_line_distance(poly,road["line"])-road["width"]/2
            street_clearance.append(d)
            if d<.5:
                failures.append(f"Parcel crosses street: {name} / {road['id']} ({d:.2f}m)")
        for water,width in [("river",5.7),("burn",3.0)]:
            d = polygon_line_distance(poly,world[water])-width
            water_clearance.append(d)
            if d<3.0:
                failures.append(f"Parcel too close to water: {name} / {water} ({d:.2f}m)")
        if polygon_distance(poly,world["crag"])<2:
            failures.append(f"Parcel crosses castle ledge: {name}")
    for name,poly in reserved:
        if polygon_distance(poly,world["market"]) < .5:
            failures.append(f"Plot obstructs market court: {name}")
    for i,lot in enumerate(lots):
        for p in lot["building"]:
            if float(signed_distance(lot["parcel"],*p))>.001:
                failures.append(f"Roof leaves its plot: {lot['id']}")
        if abs(lot["floor"]-sample_line(world["streets"][0]["line"],
                                      world["streets"][0]["heights"],lot["road"])[2])>.11:
            failures.append(f"Door level mismatch: {lot['id']}")
        for other in lots[i+1:]:
            d = polygon_distance(lot["building"],other["building"])
            roofs.append(d)
            if d<1.5:
                failures.append(f"Roofs collide: {lot['id']} / {other['id']}")
        access = np.array([lot["road"],lot["door"]])
        for other in lots:
            if other is lot:
                continue
            if polygon_line_distance(other["parcel"],access)<.3:
                failures.append(f"Entry obstructed: {lot['id']} by {other['id']}")
        if lot["form"]=="court" and lot["width"]*.37<4.0:
            failures.append(f"Courtyard too narrow: {lot['id']}")
    roads = world["streets"]
    junction_errors = []
    final_grades = {}
    for i, road in enumerate(roads):
        for other in roads[i+1:]:
            for p in route_junctions(road["line"], other["line"]):
                a = float(sample_line(road["line"], road["heights"], p)[2])
                b = float(sample_line(other["line"], other["heights"], p)[2])
                junction_errors.append(abs(a-b))
                if abs(a-b)>.02:
                    failures.append(f"Junction level mismatch: {road['id']} / {other['id']} ({abs(a-b):.3f}m)")
        profile, authored = route_samples(road, .025)
        levels = authored if road["kind"] == "bridge" else surface(world, profile[:, 0], profile[:, 1])
        grades = np.abs(np.diff(levels))/np.linalg.norm(np.diff(profile, axis=0), axis=1)
        maximum = float(np.max(grades))
        final_grades[road["id"]] = maximum
        limit = .6 if road["kind"] == "stairs" else (.35 if road["kind"] == "lane" else .17)
        if maximum>limit+.00001:
            failures.append(f"Final terrain exceeds {limit*100:g}% grade: {road['id']} ({maximum*100:.2f}%)")
    for road in roads:
        if road["kind"]!="bridge":
            for water,width in [("river",5.7),("burn",3.0)]:
                if line_distance(road["line"],world[water])-road["width"]/2-width<.5:
                    failures.append(f"Unbridged water crossing: {road['id']} / {water}")
    bridge = next(s for s in roads if s["kind"]=="bridge")
    for p in (bridge["line"][0],bridge["line"][-1]):
        if distance_to_line(world["river"],*p)[0]<6.7:
            failures.append("Bridge does not span both riverbanks")
    water = .84-.006*bridge["line"][:,0]
    wet = distance_to_line(world["river"],bridge["line"][:,0],bridge["line"][:,1])[0]<5.7
    if np.min(bridge["heights"][wet]-water[wet])<2.5:
        failures.append("Bridge deck is too low over the river")
    for stairs in (s for s in roads if s["kind"]=="stairs"):
        span=float(np.sum(np.linalg.norm(np.diff(stairs["line"],axis=0),axis=1)))
        risers=math.ceil(abs(float(stairs["heights"][-1]-stairs["heights"][0]))/.27)
        if span < risers*.45+1.8:
            failures.append(f"Stair lacks tread and landing space: {stairs['id']}")
    graph = {i:[] for i in range(len(roads))}
    for i,a in enumerate(roads):
        for j,b in enumerate(roads[i+1:],i+1):
            if line_distance(a["line"],b["line"]) <= (a["width"]+b["width"])/2:
                graph[i].append(j)
                graph[j].append(i)
    visited, queue = {0},[0]
    while queue:
        for j in graph[queue.pop()]:
            if j not in visited:
                queue.append(j)
                visited.add(j)
    if len(visited)!=len(roads):
        failures.append("Street network has a disconnected branch")
    main = roads[0]
    profile, _ = route_samples(main, .025)
    cut = np.abs(surface(world, profile[:,0], profile[:,1])-world["ground"](profile[:,0],profile[:,1]))
    if float(np.max(cut))>2.5:
        failures.append("High Street cut/fill exceeds 2.5m")
    # Drainage datum and direction are explicit and continuous at the confluence.
    burn = world["burn"]
    bh = .18*(197-burn[:,1])+.84-.006*215
    if np.any(np.diff(bh)>.001):
        failures.append("Stream has an uphill water segment")
    rd,_,_ = distance_to_line(world["river"],*burn[-1])
    if float(rd)>5.7 or abs(float(bh[-1])-(.84-.006*215))>.001:
        failures.append("Stream does not meet the river datum")
    if not any(l["id"]=="Bakery" and abs(l["width"]-11.25)<.001
               and abs(l["depth"]-8.1)<.001 for l in lots):
        failures.append("Approved bakery footprint changed")
    if failures:
        raise ValueError("\n".join(failures))
    return {
        "status":"passed", "proposal":"drawn; awaiting owner verdict; no game construction",
        "frontage_parcels":len(reserved), "connected_routes":len(visited),
        "minimum_roof_gap_m":round(min(roofs),2),
        "minimum_parcel_gap_m":round(min(parcels),2),
        "minimum_parcel_street_clearance_m":round(min(street_clearance),2),
        "minimum_parcel_water_clearance_m":round(min(water_clearance),2),
        "high_street_max_grade_pct":round(final_grades[main["id"]]*100,2),
        "final_route_max_grade_pct":{name:round(grade*100,2) for name,grade in final_grades.items()},
        "maximum_junction_level_error_m":round(max(junction_errors),4),
        "high_street_max_cut_fill_m":round(float(np.max(cut)),2),
        "river_datum_m":0, "castle_crest_m":44,
        "bakery_footprint_m":[11.25,8.1],
        "checks":["roof and parcel separation","street and water buffers",
                  "unobstructed door links","connected streets, bridge and stairs",
                  "shared junction levels and final terrain grades",
                  "bounded street cut/fill","bridge clearance and stair space",
                  "clear public market","downhill stream to river","bakery preservation"]
    }
