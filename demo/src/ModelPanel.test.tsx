import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
vi.mock('./runtime',()=>({NATIVE:true,native:vi.fn().mockResolvedValue({}),blankAccount:()=>({}),modelList:vi.fn(),modelCapabilities:vi.fn().mockResolvedValue({}),testModel:vi.fn()}));
import * as runtime from './runtime';
import {ModelPanel} from './NativePanels';
afterEach(()=>{cleanup();vi.clearAllMocks()});
describe('模型配置',()=>{
  it('服务返回模型后通过应用面板搜索选择，不再暴露读取预算',async()=>{
    const account={accountId:'test',token:'',cookie:'',modelKey:'fixture-only',modelUrl:'https://example.test/v1',modelName:'old'};
    const save=vi.fn().mockResolvedValue(undefined);const live={account,model:save} as unknown as Parameters<typeof ModelPanel>[0]['live'];
    vi.mocked(runtime.modelList).mockResolvedValue(['model-alpha','model-beta']);render(<ModelPanel live={live} notify={()=>{}} onDone={()=>{}}/>);
    fireEvent.click(screen.getByRole('button',{name:'获取模型列表'}));await waitFor(()=>expect(screen.getByRole('button',{name:'选择模型'})).toBeTruthy());
    fireEvent.click(screen.getByRole('button',{name:'选择模型'}));
    fireEvent.click(screen.getByRole('button',{name:'model-beta'}));
    expect(screen.queryByLabelText('AI 文件大小上限')).toBeNull();expect(screen.queryByLabelText('AI 资料上下文')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'保存模型配置'}));await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({modelName:'model-beta'})));
  });
});
