export const MAX_BASIC_FIELDS=12;
export const BASIC_FIELD_NAME_LIMIT=24;
export const BASIC_FIELD_VALUE_LIMIT=300;
const text=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max):'';

/** Legacy drafts used both name and keyValue. Persist one schema for all templates. */
export function normalizeBasicFields(input){
  return (Array.isArray(input)?input:[]).filter(item=>item&&typeof item==='object'&&!Array.isArray(item)).slice(0,MAX_BASIC_FIELDS).map(item=>({
    keyValue:text(typeof item.keyValue==='string'?item.keyValue:item.name,BASIC_FIELD_NAME_LIMIT),
    value:text(item.value,BASIC_FIELD_VALUE_LIMIT),
    visible:item.visible!==false,
  }));
}
export const visibleBasicFields=input=>normalizeBasicFields(input).filter(item=>item.visible&&item.value.trim());

/** 基本信息可排序字段。身高体重共用一行，以 height 作为该行的键。 */
export const BASIC_FIELD_KEYS=['name','sex','birthday','photo','workYears','mobile','email','hunyin','height','minzu','jiguan','zhengzhi'];
export const DEFAULT_BASIC_ORDER=[...BASIC_FIELD_KEYS];

/** 只保留认识的键，缺失的按默认顺序补在末尾，避免旧草稿或外部写入打乱表单。 */
export function normalizeBasicOrder(input){
  const seen=new Set(),out=[];
  for(const key of Array.isArray(input)?input:[]){
    if(!BASIC_FIELD_KEYS.includes(key)||seen.has(key))continue;
    seen.add(key);out.push(key);
  }
  for(const key of DEFAULT_BASIC_ORDER)if(!seen.has(key))out.push(key);
  return out;
}

export function hasCustomBasicOrder(input){
  return Array.isArray(input)&&input.some(key=>BASIC_FIELD_KEYS.includes(key))
    &&normalizeBasicOrder(input).join()!==DEFAULT_BASIC_ORDER.join();
}

export function moveBasicKey(order,key,index){
  const list=normalizeBasicOrder(order),from=list.indexOf(key);
  if(from<0)return list;
  const to=Math.max(0,Math.min(list.length-1,Number(index)||0));
  list.splice(to,0,...list.splice(from,1));
  return list;
}
