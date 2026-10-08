/* Supabase email/password authentication. No passwords in application tables. */
(() => {
  const T=Tidy, form=document.getElementById('auth-form'), page=document.body.dataset.page;
  const status=document.createElement('p'); status.className='auth-status'; status.setAttribute('role','status'); form.append(status);
  const submit=form.querySelector('button[type=submit],button.btn-primary');
  const message=(text,error=false)=>{status.textContent=text;status.classList.toggle('error',error);};
  async function run(fn) {
    submit.disabled=true; message('');
    try { await fn(); } catch(e) {message(e.message || 'Something went wrong. Please try again.',true);}
    finally {submit.disabled=false;}
  }
  form.onsubmit=e=>{e.preventDefault();run(async()=>{
    if (page==='signup') {
      const password=document.getElementById('p1').value;
      if (password!==document.getElementById('p2').value) throw new Error("Passwords don't match.");
      const data=await T.signup({first:document.getElementById('fn').value.trim(),last:document.getElementById('ln').value.trim(),email:document.getElementById('em').value.trim(),username:document.getElementById('u').value.trim()},password);
      if (data.session) location.href='home.html';
      else { form.reset();message('Check your email for a confirmation link, then return here to log in. If you already have an account, use Log in.'); }
    } else if (page==='reset-password') {
      if (document.getElementById('p1').value!==document.getElementById('p2').value) throw new Error("Passwords don't match.");
      await T.changePassword(document.getElementById('p1').value); form.reset();message('Password updated. You can return to Log in.');
    } else {
      await T.login(document.getElementById('u').value.trim(),document.getElementById('p').value);
      location.href='home.html';
    }
  });};
  const forgot=document.getElementById('forgot');
  if(forgot) forgot.onclick=()=>run(async()=>{
    const input=document.getElementById('u');
    if(!input.value || !input.checkValidity()) throw new Error('Enter your email address above first.');
    await T.resetPassword(input.value.trim());message('If that address has an account, a password reset email is on its way.');
  });
  // Keep auth pages available even if database setup is incomplete.
  if (!window.tidyClient) {submit.disabled=true;message('Could not load Supabase. Check your internet connection and reload.',true);}
  else if (page==='reset-password') {
    submit.disabled=true;
    window.tidyClient.auth.getSession().then(({data,error})=>{
      if(error || !data.session) message('Open the latest password reset link from your email to continue.',true);
      else submit.disabled=false;
    }).catch(()=>message('Could not verify the reset link. Reload and try again.',true));
  }
})();
