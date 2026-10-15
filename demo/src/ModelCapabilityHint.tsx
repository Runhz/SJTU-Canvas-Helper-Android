import {useEffect,useState} from 'react';
import {modelCapabilities,type AccountConfig,type ModelCapabilities} from './runtime';
export function ModelCapabilityHint({config}:{config:AccountConfig}) {
  const [caps,setCaps]=useState<ModelCapabilities|null>(null);
  useEffect(()=>{let active=true;setCaps(null);if(!config.modelKey||!config.modelName)return;const timer=setTimeout(()=>{void modelCapabilities(config).then(value=>{if(active)setCaps(value);}).catch(()=>{});},500);return()=>{active=false;clearTimeout(timer);};},[config.modelUrl,config.modelKey,config.modelName]);
  return <div className="model-capability-hint"><span>{caps?.contextTokens?`上下文 ${caps.contextTokens.toLocaleString()} Token`:'上下文自动适配'}</span><span>{caps?.vision===true?'支持图片':caps?.vision===false?'文字模型':'图片能力待确认'}</span><p>课件先提取文字，再按模型容量选择或分段处理。</p></div>;
}
