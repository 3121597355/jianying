export function memberQuota(member){
  if(!member?.authenticated)return null;
  const limit=Number(member.quota?.limit??member.config?.aiDailyLimit??3);
  const used=Number(member.quota?.used??member.usedToday??0);
  return {limit,used,remaining:Math.max(0,limit-used),resetAt:member.quota?.resetAt};
}
export function quotaText(member){
  const quota=memberQuota(member);
  return quota?`今日剩余 ${quota.remaining} / ${quota.limit} 次免费 AI`:`登录后每天 ${member?.config?.aiDailyLimit||3} 次免费 AI`;
}
export function resetText(quota){
  if(!quota?.resetAt)return '每天 00:00（北京时间）重置';
  const time=new Date(quota.resetAt);
  if(Number.isNaN(time.getTime()))return '每天 00:00（北京时间）重置';
  return new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Shanghai'}).format(time)+'（北京时间）恢复';
}
