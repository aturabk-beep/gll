import {describe,expect,it} from 'vitest';
import {farmImageBounds,farmPreviewBoundary} from './farm-preview';

describe('farm boundary preview',()=>{
 it('uses the calibrated image extent at zero buffer',()=>{
  const boundary=farmPreviewBoundary(0);
  expect(boundary.south).toBe(farmImageBounds.south);
  expect(boundary.west).toBe(farmImageBounds.west);
  expect(boundary.north).toBe(farmImageBounds.north);
  expect(boundary.east).toBe(farmImageBounds.east);
 });
 it('expands all four sides and caps the preview at 1000 metres',()=>{
  const boundary=farmPreviewBoundary(1000);
  expect(boundary.south).toBeLessThan(farmImageBounds.south);
  expect(boundary.west).toBeLessThan(farmImageBounds.west);
  expect(boundary.north).toBeGreaterThan(farmImageBounds.north);
  expect(boundary.east).toBeGreaterThan(farmImageBounds.east);
  expect(farmPreviewBoundary(2000)).toEqual(boundary);
 });
});
