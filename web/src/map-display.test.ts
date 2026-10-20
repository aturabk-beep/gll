import {it,expect} from 'vitest';
import {initials,coloredRoute,routeColor,routeGradient,stabilizeRoute} from './map-display';
import type {Point} from './domain';
const point=(seconds:number,accuracy=10)=>({id:String(seconds),measured_at:new Date(seconds*1000).toISOString(),latitude:37,longitude:30+seconds/10000,accuracy,clock_skew:false} as Point);
it('uses first and last name initials with Turkish casing',()=>{expect(initials('  ismail Ali şen ')).toBe('İŞ');expect(initials('Murat Toksavul')).toBe('MT');expect(initials('Ali')).toBe('A');expect(initials('')).toBe('?')});
it('orders history without joining gaps or rejected fixes',()=>{const r=coloredRoute([point(500),point(510),point(0),point(10),point(20,200)]);expect(r.first?.id).toBe('0');expect(r.last?.id).toBe('510');expect(r.groups.map(g=>g.points.map(p=>p.id))).toEqual([['0','10'],['500','510']]);expect(routeColor(0)).not.toBe(routeColor(1));expect(coloredRoute([point(0)]).groups).toHaveLength(0)});
it('uses distinct time-percentage stops from blue to green',()=>{expect(routeColor(0)).toBe('rgb(37, 99, 235)');expect(routeColor(.25)).toBe('rgb(56, 189, 248)');expect(routeColor(.5)).toBe('rgb(20, 184, 166)');expect(routeColor(.75)).toBe('rgb(132, 204, 22)');expect(routeColor(1)).toBe('rgb(22, 163, 74)');expect(routeGradient).toContain('100%')});
it('softens a weak isolated GPS jump without moving reliable fixes',()=>{
 const points=[point(0),{...point(10),latitude:37.0004,accuracy:40},point(20)];
 const stable=stabilizeRoute(points);
 expect(stable[0]).toBe(points[0]);
 expect(stable[1].latitude).toBeLessThan(37.0001);
 expect(stable[2]).toBe(points[2]);
});
