const themeControl=document.createElement('button');
themeControl.id='theme-toggle';
themeControl.className='theme-toggle';
document.querySelector('.header-right').prepend(themeControl);
function syncTheme(){const dark=document.documentElement.dataset.theme==='dark';themeControl.innerHTML=`<span aria-hidden="true">${dark?'☀':'☾'}</span><span class="theme-label">${dark?'โหมดสว่าง':'โหมดมืด'}</span>`;themeControl.setAttribute('aria-label',dark?'เปลี่ยนเป็นโหมดสว่าง':'เปลี่ยนเป็นโหมดมืด');themeControl.setAttribute('aria-pressed',String(dark));}
themeControl.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;try{localStorage.setItem('cinema67-theme',next)}catch{}syncTheme()});
syncTheme();
