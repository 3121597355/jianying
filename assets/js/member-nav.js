import {refreshMember,installMemberNav} from './member-client.js';
installMemberNav();
void refreshMember().then(()=>installMemberNav()).catch(()=>{});
