import type {CampusVoice} from './campusPlay';

/** Small, original vector portraits: no remote images or personal photos. */
export function CampusAvatar({character}:{character:CampusVoice['character']}){
  return <svg className={`campus-avatar ${character}`} viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="32" fill={character==='student'?'#dcebd2':character==='teacher'?'#e9e2d2':'#d9e7ed'}/>
    {character==='teacher'&&<path d="M16 27Q14 8 32 9Q49 8 49 29L48 47H16Z" fill="#5d5149"/>}
    <path d="M8 64V57Q10 43 26 43H38Q54 43 56 57V64" fill={character==='student'?'#71966c':character==='teacher'?'#c58e68':'#658c9d'}/>
    <path d="M27 39H37V47L32 51L27 47Z" fill="#efc5a4"/>
    <ellipse cx="18" cy="30" rx="3" ry="4" fill="#efc5a4"/><ellipse cx="46" cy="30" rx="3" ry="4" fill="#efc5a4"/>
    <path d="M18 24Q18 12 32 12Q46 12 46 24V32Q45 44 32 45Q19 44 18 32Z" fill="#f5d6b9"/>
    {character==='student'?<path d="M17 28Q12 13 28 9Q48 6 48 28L43 24L40 18Q30 25 20 23L19 29Z" fill="#4e4a40"/>:character==='teacher'?<path d="M17 28Q15 10 31 10Q49 10 47 28Q39 23 34 16Q30 23 18 25Z" fill="#5d5149"/>:<><path d="M18 28V19H46V28L42 24V19H22V26Z" fill="#5a5650"/><path d="M15 19Q16 7 32 7Q47 7 49 19Z" fill="#769aa7"/><path d="M14 19H46Q53 19 52 23H17Z" fill="#4f7b8d"/><path d="M28 11H36V15H28Z" fill="#dfecee"/></>}
    <g stroke="#504e45" strokeWidth="1.8" strokeLinecap="round" fill="none"><path d="M25 30V31M39 30V31"/><path d="M28 37Q32 40 36 37"/></g>
    {character==='teacher'&&<g stroke="#737164" strokeWidth="1.4" fill="none"><rect x="20" y="27" width="10" height="8" rx="3"/><rect x="34" y="27" width="10" height="8" rx="3"/><path d="M30 30H34"/></g>}
    <path d="M25 46L32 51L39 46L37 57H27Z" fill="#fff8e9"/>
    {character==='student'?<g fill="#43694b"><path d="M17 48L21 46L24 64H20Z"/><path d="M43 46L47 48L44 64H40Z"/></g>:character==='staff'?<><path d="M32 52V64" stroke="#467180" strokeWidth="2"/><rect x="40" y="53" width="8" height="6" rx="1" fill="#e0eced"/></>:<path d="M23 46L27 57L19 52ZM41 46L37 57L45 52Z" fill="#a97454"/>}
  </svg>;
}
