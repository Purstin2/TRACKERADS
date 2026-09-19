const fs=require('fs'),{PNG}=require('pngjs')
const ler=(f)=>PNG.sync.read(fs.readFileSync(f))

/** recorta a margem transparente (os arquivos vem com muito respiro em volta) */
function trim(p){ // limiar 70: o arquivo de origem tem ruido de alpha 1-16 nos cantos,
  // e com limiar baixo o recorte devolvia metade da tela vazia
  const{width:w,height:h,data:d}=p
  let x0=w,y0=h,x1=-1,y1=-1
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(d[(y*w+x)*4+3]>70){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}
  const nw=x1-x0+1,nh=y1-y0+1,o=new PNG({width:nw,height:nh})
  for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){const s=((y+y0)*w+(x+x0))*4,t=(y*nw+x)*4
    o.data[t]=d[s];o.data[t+1]=d[s+1];o.data[t+2]=d[s+2];o.data[t+3]=d[s+3]}
  return o
}
/** reducao com media de area (box filter), alpha pre-multiplicado pra nao sujar a borda */
function resize(p,nw,nh){
  const{width:w,height:h,data:d}=p, o=new PNG({width:nw,height:nh})
  const sx=w/nw, sy=h/nh
  for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){
    const x0=Math.floor(x*sx),x1=Math.max(x0+1,Math.ceil((x+1)*sx))
    const y0=Math.floor(y*sy),y1=Math.max(y0+1,Math.ceil((y+1)*sy))
    let r=0,g=0,b=0,a=0,n=0
    for(let j=y0;j<Math.min(y1,h);j++)for(let i=x0;i<Math.min(x1,w);i++){
      const s=(j*w+i)*4, al=d[s+3]/255
      r+=d[s]*al; g+=d[s+1]*al; b+=d[s+2]*al; a+=d[s+3]; n++}
    const t=(y*nw+x)*4, am=a/n
    o.data[t]=am?Math.round(r/n/(am/255)):0
    o.data[t+1]=am?Math.round(g/n/(am/255)):0
    o.data[t+2]=am?Math.round(b/n/(am/255)):0
    o.data[t+3]=Math.round(am)
  }
  return o
}
/** poe o logo centralizado sobre fundo solido, com respiro pra mascara do PWA */
function sobreFundo(p,size,bg,ocupa){
  const o=new PNG({width:size,height:size})
  for(let i=0;i<size*size;i++){const t=i*4;o.data[t]=bg[0];o.data[t+1]=bg[1];o.data[t+2]=bg[2];o.data[t+3]=255}
  const max=Math.round(size*ocupa)
  const esc=Math.min(max/p.width,max/p.height)
  const nw=Math.round(p.width*esc),nh=Math.round(p.height*esc)
  const r=resize(p,nw,nh)
  const ox=Math.round((size-nw)/2),oy=Math.round((size-nh)/2)
  for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){
    const s=(y*nw+x)*4,t=((y+oy)*size+(x+ox))*4,al=r.data[s+3]/255
    o.data[t]=Math.round(r.data[s]*al+o.data[t]*(1-al))
    o.data[t+1]=Math.round(r.data[s+1]*al+o.data[t+1]*(1-al))
    o.data[t+2]=Math.round(r.data[s+2]*al+o.data[t+2]*(1-al))
  }
  return o
}
/** canvas quadrado, fundo transparente, marca centralizada */
function quadradoTransp(p,size){
  const o=new PNG({width:size,height:size})
  o.data.fill(0)
  const esc=Math.min(size/p.width,size/p.height)
  const nw=Math.round(p.width*esc),nh=Math.round(p.height*esc)
  const r=resize(p,nw,nh)
  const ox=Math.round((size-nw)/2),oy=Math.round((size-nh)/2)
  for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){const s2=(y*nw+x)*4,t=((y+oy)*size+(x+ox))*4
    o.data[t]=r.data[s2];o.data[t+1]=r.data[s2+1];o.data[t+2]=r.data[s2+2];o.data[t+3]=r.data[s2+3]}
  return o
}
const salvar=(p,f)=>{fs.writeFileSync(f,PNG.sync.write(p));console.log('  '+f.padEnd(34)+p.width+'x'+p.height+'   '+Math.round(fs.statSync(f).size/1024)+'KB')}

const icone=trim(ler(process.argv[2]))
const word=trim(ler(process.argv[3]))
console.log('recortado:  icone '+icone.width+'x'+icone.height+'   wordmark '+word.width+'x'+word.height)
console.log('\ngerando:')
// wordmark da sidebar: exibido a 26px de altura -> 160px cobre retina com folga
salvar(resize(word,Math.round(word.width*(104/word.height)),104),'public/logo.png')
// favicon: marca sozinha, fundo transparente (a aba do navegador cuida do fundo)
salvar(quadradoTransp(icone,64),'public/favicon.png')
// icones do PWA: fundo solido do app + respiro de 22% pra mascara nao cortar o P
salvar(sobreFundo(icone,192,[6,6,6],0.62),'public/app-icon-192.png')
salvar(sobreFundo(icone,512,[6,6,6],0.62),'public/app-icon-512.png')
