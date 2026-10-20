import {afterEach,describe,expect,it,vi} from 'vitest';
import {request} from './api';

afterEach(()=>vi.restoreAllMocks());

describe('request',()=>{
 it('retries a transient GET failure',async()=>{
  vi.spyOn(globalThis,'setTimeout').mockImplementation(((callback:()=>void)=>{callback();return 0}) as typeof setTimeout);
  const fetchMock=vi.spyOn(globalThis,'fetch')
   .mockRejectedValueOnce(new TypeError('Failed to fetch'))
   .mockResolvedValueOnce(new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json'}}));
  await expect(request<{ok:boolean}>('/api/test')).resolves.toEqual({ok:true});
  expect(fetchMock).toHaveBeenCalledTimes(2);
 });

 it('does not retry writes and hides the browser fetch error',async()=>{
  const fetchMock=vi.spyOn(globalThis,'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(request('/api/test','POST',{})).rejects.toThrow('Sunucuya ulaşılamadı');
  expect(fetchMock).toHaveBeenCalledTimes(1);
 });
});
