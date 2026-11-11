import React from 'react';
import {createRoot} from 'react-dom/client';
import {BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell} from 'recharts';
import {LayoutDashboard, List, PenLine, Target, Repeat2, TrendingDown, ChartNoAxesCombined} from 'lucide-react';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Input } from './components/ui/input';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './components/ui/dialog';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from './components/ui/table';
const colors=['#4466d5','#7292ed','#9ab0f1','#d0a46a','#b1b7c9','#8c93af'];
const format=n=>`${Number(n).toLocaleString('ko-KR')}원`;
function Charts({rows,month}){
 const [query,setQuery]=React.useState('');
 const selected=new Date(+month.slice(0,4),+month.slice(5,7)-1,1);
 const months=Array.from({length:6},(_,i)=>{const d=new Date(selected.getFullYear(),selected.getMonth()-5+i,1);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;return {name:`${d.getMonth()+1}월`,지출:rows.filter(r=>r.kind==='지출'&&r.date.startsWith(key)).reduce((n,r)=>n+r.amount,0)}});
 const totals={};rows.filter(r=>r.kind==='지출'&&r.date.startsWith(month)).forEach(r=>totals[r.category]=(totals[r.category]||0)+r.amount);
 const categories=Object.entries(totals).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}));
 return <div className="chart-grid">
 <Card className="analysis-card"><div className="chart-header"><div><p className="chart-kicker">SPENDING TREND</p><h2>월별 지출 흐름</h2><p className="chart-subtitle">선택한 달을 포함한 최근 6개월</p></div><span className="chart-icon"><ChartNoAxesCombined size={19}/></span></div>{months.some(x=>x.지출)?<div className="chart-area" role="img" aria-label="최근 6개월 지출 막대 차트"><ResponsiveContainer width="100%" height="100%"><BarChart data={months} margin={{top:12,right:4,left:-16,bottom:0}}><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize:12,fill:'#858991'}}/><YAxis axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#858991'}} width={55} tickFormatter={v=>v>=10000?`${Math.round(v/10000)}만`:v}/><Tooltip formatter={format} cursor={{fill:'#eef5ee'}}/><Bar isAnimationActive={false} dataKey="지출" fill="#526fd3" radius={[6,6,0,0]} maxBarSize={38}/></BarChart></ResponsiveContainer></div>:<div className="chart-empty"><TrendingDown size={23}/><span>지출 내역을 기록하면 흐름을 볼 수 있어요.</span><Button type="button" onClick={()=>document.querySelector('[data-page="entry"]').click()}>내역 입력하기 →</Button></div>}</Card>
 <Card className="analysis-card"><div className="chart-header"><div><p className="chart-kicker">CATEGORY INSIGHTS</p><h2>카테고리별 소비</h2><p className="chart-subtitle">이번 달 지출 비중</p></div><Dialog><DialogTrigger asChild><Button variant="outline" size="sm" className="chart-details">상세 보기</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>카테고리별 소비</DialogTitle><DialogDescription>선택한 달의 지출을 카테고리별로 확인하세요.</DialogDescription></DialogHeader><Input aria-label="카테고리 검색" placeholder="카테고리 검색" value={query} onChange={e=>setQuery(e.target.value)}/><Table><TableHeader><TableRow><TableHead>카테고리</TableHead><TableHead className="text-right">지출</TableHead></TableRow></TableHeader><TableBody>{categories.filter(c=>c.name.includes(query)).map(c=><TableRow key={c.name}><TableCell>{c.name}</TableCell><TableCell className="text-right">{format(c.value)}</TableCell></TableRow>)}</TableBody></Table></DialogContent></Dialog></div>{categories.length?<div className="category-chart"><div className="donut" role="img" aria-label="카테고리별 지출 비중"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={categories} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="90%" stroke="white" strokeWidth={2}>{categories.map((c,i)=><Cell key={c.name} fill={colors[i%colors.length]}/>)}</Pie><Tooltip formatter={format}/></PieChart></ResponsiveContainer></div><div className="chart-legend">{categories.slice(0,5).map((c,i)=><div key={c.name}><span><i style={{background:colors[i%colors.length]}}/>{c.name}</span><b>{format(c.value)}</b></div>)}{categories.length>5&&<small>그 외 {categories.length-5}개 카테고리</small>}</div></div>:<div className="chart-empty"><Target size={23}/><span>이번 달 지출을 기록해 보세요.</span></div>}</Card>
 </div>
}
const root=createRoot(document.getElementById('analytics'));
window.updateLedgerCharts=(rows,month)=>root.render(<Charts rows={rows} month={month}/>);
const icons=[LayoutDashboard,List,PenLine,Target,Repeat2];
document.querySelectorAll('.nav span').forEach((el,i)=>{if(icons[i]){const Icon=icons[i];createRoot(el).render(<Icon size={19} strokeWidth={1.8} aria-hidden="true"/>);}});
