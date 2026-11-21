import*as f from"node:fs";
let I=process.env.MAKEFUN_INPUT_DIR,O=process.env.MAKEFUN_OUTPUT_DIR,W,N,m,A,G,B,S,all,cur,k;
const D=[1,-1,0,0],C="rldu";
B=(o,s)=>{let v={[s]:s},q=[s];m=s;for(let i=0;i<q.length;i++)for(let d of D){let y=q[i]+d;if(!o[y]&&v[y]==null){v[y]=q[i];if(y<m)m=y;q.push(y)}}return v};
S=(b,p,o)=>{
let V={},Q=[[b,p,""]],h=0,ob=x=>{let t=A.slice();for(let y of o.concat(x))t[y]=1;return t};
B(ob(b),p);V[m+":"+b.join(",")]=1;
if(b.every(x=>G[x]))return"";
for(;h<Q.length;h++){
let[c,pl,mv]=Q[h],oc=ob(c),v=B(oc,pl);
for(let i=0;i<c.length;i++)for(let j=0;j<4;j++){let e=c[i],d=D[j],y=e+d,z=e-d;
if(v[z]==null||A[y]||oc[y])continue;
let n=c.slice();n[i]=y;n.sort((u,w)=>u-w);
B(ob(n),e);
let K=m+":"+n.join(",");
if(V[K])continue;
V[K]=1;
let w="";for(let q=z;q!==pl;q=v[q])w=C[D.indexOf(q-v[q])]+w;
let nm=mv+w+C[j];
if(n.every(x=>G[x])){all=o.concat(n);cur=e;return nm}
Q.push([n,e,nm])}}
return null};
for(k=1;k<6;k++){
let id="i00"+k,t=f.readFileSync(I+"/"+id+"/level.txt","utf8"),r=t.trim().split("\n"),w=r[0].length,L=r.join("");N=L.length;
A=Uint8Array.from(L,c=>c=="#");G=Uint8Array.from(L,c=>".*+".includes(c));let b=[],p;
for(let i=0;i<N;i++){let c=L[i];if("$*".includes(c))b.push(i);if("@+".includes(c))p=i}
W=w;D[2]=w;D[3]=-w;b.sort((u,v)=>u-v);
let hr=(p/W)|0,u=A.slice();
for(let i=hr*W;i<(hr+1)*W;i++)u[i]=1;
let R=[],U={};
for(let x of b){if(U[x])continue;let v=B(u,x),rb=[];for(let y of b)if(v[y]!=null){rb.push(y);U[y]=1}R.push(rb)}
let mv="";all=b.slice();cur=p;
for(let rb of R){
let o=all.filter(x=>!rb.includes(x)),s=S(rb,cur,o);
if(s===null){mv="";break}
mv+=s}
f.mkdirSync(O+"/"+id,{recursive:true});f.writeFileSync(O+"/"+id+"/solution.txt",mv+"\n")}
