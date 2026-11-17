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
