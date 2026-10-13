import {describe,expect,it} from 'vitest';
import type {readFileSync} from 'node:fs';
import {resolvePrContext} from './context.js';

function context(head:object,base:object) {
  const read=(()=>JSON.stringify({pull_request:{number:20,head:{sha:'a'.repeat(40),repo:head},base:{repo:base}}})) as unknown as typeof readFileSync;
  return resolvePrContext({GITHUB_REPOSITORY:'student/course',GITHUB_EVENT_PATH:'fixture.json'},read);
}
describe('Pull request origin in a forked repository',()=>{
  it('allows an internal PR even when its repository is itself a fork',()=>{
    expect(context({id:42,full_name:'student/course',fork:true},{id:42,full_name:'student/course'}).isFork).toBe(false);
  });
  it('rejects a cross-repository PR even when the head repository is not marked as a fork',()=>{
    expect(context({id:43,full_name:'other/course',fork:false},{id:42,full_name:'student/course'}).isFork).toBe(true);
  });
  it('compares repository names when numeric event IDs are unavailable',()=>{
    expect(context({full_name:'student/course',fork:true},{full_name:'student/course'}).isFork).toBe(false);
    expect(context({full_name:'other/course',fork:false},{full_name:'student/course'}).isFork).toBe(true);
  });
});
