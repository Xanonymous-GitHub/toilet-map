import {useEffect,useRef,useState} from 'react';
import maplibregl from 'maplibre-gl';
import {MapPin,Plus,Minus,LocateFixed,Map as MapIcon} from 'lucide-react';
import {scheduleState,type Toilet} from './core';
type Props={items:Toilet[];center:[number,number];zoom:number;selected:string|null;position:{lat:number;lon:number;accuracy:number}|null;now:Date;onSelect:(id:string)=>void;onBounds:(b:[number,number,number,number],c:[number,number])=>void;onManual:()=>void;onLocate:()=>void;locating:boolean;locateSupported:boolean};
export default function MapView(p:Props){
  const holder=useRef<HTMLDivElement>(null),map=useRef<maplibregl.Map|null>(null),latest=useRef(p),clusters=useRef<Map<string,maplibregl.Marker>>(new Map());
  latest.current=p;
  const [ready,setReady]=useState(false),[failed,setFailed]=useState(false),[tileError,setTileError]=useState(false);
  useEffect(()=>{
    let m:maplibregl.Map;
    try{m=new maplibregl.Map({container:holder.current!,center:latest.current.center,zoom:latest.current.zoom,minZoom:5,maxZoom:19,attributionControl:{compact:false},style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}},layers:[{id:'base',type:'raster',source:'osm',paint:{'raster-saturation':-.6,'raster-contrast':-.12}}]}});}catch{setFailed(true);return;}
    map.current=m;
    const emitBounds=()=>{const b=m.getBounds(),c=m.getCenter();latest.current.onBounds([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()],[c.lng,c.lat]);};
    m.on('load',()=>{
      m.addSource('toilets',{type:'geojson',data:{type:'FeatureCollection',features:[]},cluster:true,clusterMaxZoom:13,clusterRadius:48});
      m.addLayer({id:'cluster-circles',type:'circle',source:'toilets',filter:['has','point_count'],paint:{'circle-color':'#075f51','circle-radius':18,'circle-stroke-color':'#fff','circle-stroke-width':3}});
      m.addLayer({id:'points',type:'circle',source:'toilets',filter:['!',['has','point_count']],paint:{'circle-radius':8,'circle-color':['match',['get','state'],'open','#16836c','closed','#aa7864','#77938c'],'circle-stroke-color':'#fff','circle-stroke-width':2.5}});
      m.addLayer({id:'selected',type:'circle',source:'toilets',filter:['==',['get','id'],''],paint:{'circle-radius':14,'circle-color':'#075f51','circle-stroke-width':4,'circle-stroke-color':'#cef0bd'}});
      m.addSource('position',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      m.addLayer({id:'precision',type:'circle',source:'position',paint:{'circle-color':'#3977e8','circle-opacity':.13,'circle-radius':['get','radius'],'circle-stroke-color':'#3977e8','circle-stroke-width':1,'circle-stroke-opacity':.3}});
      m.addLayer({id:'position-dot',type:'circle',source:'position',paint:{'circle-color':'#3977e8','circle-radius':7,'circle-stroke-color':'#fff','circle-stroke-width':3}});
      setReady(true);emitBounds();
    });
    m.on('click','points',(e)=>{const id=e.features?.[0]?.properties?.id;if(id)latest.current.onSelect(String(id));});
    m.on('mouseenter','points',()=>{m.getCanvas().style.cursor='pointer';});
    m.on('mouseleave','points',()=>{m.getCanvas().style.cursor='';});
    m.on('dragstart',()=>latest.current.onManual());
    m.on('zoomstart',(e)=>{if(e.originalEvent)latest.current.onManual();});
    m.on('moveend',emitBounds);
    m.on('error',(e)=>{if(/tile|fetch|network|ajax/i.test(e.error?.message??''))setTileError(true);});
    return()=>{clusters.current.forEach(x=>x.remove());clusters.current.clear();m.remove();map.current=null;setReady(false);};
  },[]);
  useEffect(()=>{const m=map.current;if(ready&&m)m.flyTo({center:p.center,zoom:p.zoom,duration:800,essential:true});},[p.center,p.zoom,ready]);
  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    const source=m.getSource('toilets') as maplibregl.GeoJSONSource;
    source.setData({type:'FeatureCollection',features:p.items.map(t=>({type:'Feature',geometry:{type:'Point',coordinates:[t.lon,t.lat]},properties:{id:t.id,state:scheduleState(t,p.now)}}))});
  },[p.items,p.now,ready]);
  useEffect(()=>{if(ready&&map.current)map.current.setFilter('selected',['==',['get','id'],p.selected??'']);},[p.selected,ready]);
  useEffect(()=>{
    const m=map.current;if(!ready||!m)return;
    const update=()=>{
      if(!m.getSource('toilets')||!m.isSourceLoaded('toilets'))return;
      const active=new Set<string>();
      for(const feature of m.querySourceFeatures('toilets')){
        const props=feature.properties;if(!props?.cluster||feature.geometry.type!=='Point')continue;
        const id=String(props.cluster_id);if(active.has(id))continue;active.add(id);
        if(!clusters.current.has(id)){
          const btn=document.createElement('button');btn.className='cluster-label';btn.textContent=String(props.point_count_abbreviated);btn.setAttribute('aria-label',`放大查看 ${props.point_count} 間廁所`);
          const coords=feature.geometry.coordinates as [number,number];
          btn.onclick=async()=>{const zoom=await (m.getSource('toilets') as maplibregl.GeoJSONSource).getClusterExpansionZoom(Number(id));m.easeTo({center:coords,zoom});};
          clusters.current.set(id,new maplibregl.Marker({element:btn}).setLngLat(feature.geometry.coordinates as [number,number]).addTo(m));
        }
        const marker=clusters.current.get(id)!;
        marker.setLngLat(feature.geometry.coordinates as [number,number]);
        marker.getElement().textContent=String(props.point_count_abbreviated);
        marker.getElement().setAttribute('aria-label',`放大查看 ${props.point_count} 間廁所`);
        marker.getElement().onclick=async()=>{const zoom=await (m.getSource('toilets')as maplibregl.GeoJSONSource).getClusterExpansionZoom(Number(id));m.easeTo({center:feature.geometry.type==='Point'?feature.geometry.coordinates as [number,number]:m.getCenter(),zoom});};
      }
      for(const [id,marker]of clusters.current)if(!active.has(id)){marker.remove();clusters.current.delete(id);}
    };
    m.on('render',update);return()=>{m.off('render',update);};
  },[ready]);
  useEffect(()=>{
    const m=map.current;if(!ready||!m)return;
    const update=()=>{const c=p.position;
      const radius=c?Math.min(160,Math.max(12,c.accuracy/(156543.03392*Math.cos(c.lat*Math.PI/180)/2**m.getZoom()))):0;
      (m.getSource('position')as maplibregl.GeoJSONSource).setData({type:'FeatureCollection',features:c?[{type:'Feature',geometry:{type:'Point',coordinates:[c.lon,c.lat]},properties:{radius}}]:[]});
    };update();m.on('zoomend',update);return()=>{m.off('zoomend',update);};
  },[p.position,p.center,ready]);
  return <div className="map-stage">
    <div className="map-canvas" ref={holder} aria-label="公廁位置地圖"/>
    {failed&&<div className="map-fallback"><MapIcon size={34}/><strong>這個裝置無法顯示互動地圖</strong><p>仍可用下方清單搜尋、查看資訊與導航。</p></div>}
    {tileError&&!failed&&<div className="map-network-note">底圖暫時無法載入，廁所清單仍可使用。</div>}
    <div className="map-controls">
      <div className="zoom-controls"><button aria-label="放大地圖" onClick={()=>map.current?.zoomIn()}><Plus size={19}/></button><button aria-label="縮小地圖" onClick={()=>map.current?.zoomOut()}><Minus size={19}/></button></div>
      <button className={`locate-control ${p.locating?'locating':''}`} aria-label="定位目前位置" disabled={p.locating||!p.locateSupported} onClick={p.onLocate}><LocateFixed size={22}/></button>
    </div>
    <div className="map-legend"><span className="legend-dot open"/>時段開放 <span className="legend-dot unknown"/>時間未知 <span className="legend-dot closed"/>非開放時段</div>
    {!ready&&!failed&&<div className="map-loading"><MapPin size={18}/>地圖載入中</div>}
  </div>;
}
