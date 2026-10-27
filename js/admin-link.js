/* The link is convenience only. Database RLS/RPCs enforce authorization. */
(() => {
 const db=window.tidyClient;if(!db)return;
 let allowed=false;
 function update(){for(const nav of document.querySelectorAll('nav.nav')){const link=nav.querySelector('[data-admin-link]');if(!allowed){link?.remove();continue}if(!link){const a=document.createElement('a');a.href='admin.html';a.dataset.adminLink='true';a.textContent='Admin';nav.append(a)}}}
 async function check(){try{const {data:{session}}=await db.auth.getSession();if(!session){allowed=false;update();return}const {data,error}=await db.rpc('coursewise_is_admin');allowed=!error&&data===true;update()}catch{allowed=false;update()}}
 const observer=new MutationObserver(update);observer.observe(document.body,{childList:true,subtree:true});
 db.auth.onAuthStateChange(()=>setTimeout(check,0));check();
})();
