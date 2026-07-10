const DEFAULT_USER_ROLE = 'user';

function getSupabaseClient() {
  if (window.parent && window.parent.supabase && typeof window.parent.supabase.auth !== 'undefined') {
    return window.parent.supabase;
  }

  if (window.parent && window.parent.$supabase) {
    return window.parent.$supabase;
  }

  const parentUrl = window.parent?.SUPABASE_URL || window.parent?.VITE_SUPABASE_URL;
  const parentKey = window.parent?.SUPABASE_ANON_KEY || window.parent?.VITE_SUPABASE_ANON_KEY;

  if (window.supabase && typeof window.supabase.createClient === 'function' && parentUrl && parentKey) {
    return window.supabase.createClient(parentUrl, parentKey);
  }

  return null;
}

function showMessage(message) {
  alert(message);
}

async function closeParentLoginModal() {
  try {
    const parent = window.parent;
    if (!parent) return;
    const modalEl = parent.document.getElementById('loginSignupModal');
    if (!modalEl) return;
    const modalInstance = parent.bootstrap?.Modal?.getInstance(modalEl);
    if (modalInstance) {
      modalInstance.hide();
      return;
    }
    parent.location.reload();
  } catch (error) {
    console.warn('Unable to close parent modal', error);
  }
}

async function notifyParentAuthUpdate() {
  try {
    if (window.parent && typeof window.parent.updateAuthUI === 'function') {
      window.parent.updateAuthUI();
    }
  } catch (error) {
    console.warn('Unable to notify parent auth update', error);
  }
}

async function getUserEmailByUsername(supabase, username) {
  const { data, error } = await supabase.from('users').select('email').eq('username', username).maybeSingle();
  if (error) {
    console.warn('Error looking up user by username', error);
    return null;
  }
  return data?.email || null;
}

async function signInWithIdentifier(supabase, identifier, password) {
  const isEmail = identifier.includes('@');
  if (isEmail) {
    return supabase.auth.signInWithPassword({ email: identifier, password });
  }

  const email = await getUserEmailByUsername(supabase, identifier);
  if (!email) {
    return { data: null, error: { message: 'No account found with that username or email.' } };
  }

  return supabase.auth.signInWithPassword({ email, password });
}

async function handleLogin(supabase) {
  const identifier = document.querySelector('input[name="loginUsername"]').value.trim();
  const password = document.querySelector('input[name="loginPassword"]').value;

  if (!identifier || !password) {
    showMessage('Please enter both username/email and password.');
    return;
  }

  const { data, error } = await signInWithIdentifier(supabase, identifier, password);
  if (error) {
    showMessage(`Login failed: ${error.message}`);
    return;
  }

  showMessage('Login successful.');
  await notifyParentAuthUpdate();
  await closeParentLoginModal();
}

async function handleSignup(supabase) {
  const email = document.querySelector('input[name="signupEmail"]').value.trim();
  const fullName = document.querySelector('input[name="signupFullName"]').value.trim();
  const section = document.querySelector('input[name="signupSection"]').value.trim();
  const password = document.querySelector('input[name="signupPassword"]').value;

  if (!email || !fullName || !section || !password) {
    showMessage('Please fill out every signup field.');
    return;
  }

  const username = section.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!username) {
    showMessage('Section must contain letters or numbers.');
    return;
  }

  const { data: existingUsername } = await supabase.from('users').select('id').eq('username', username).maybeSingle();
  if (existingUsername) {
    showMessage('That section is already taken as a login identifier. Try a different section.');
    return;
  }

  const { data: existingEmail } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  if (existingEmail) {
    showMessage('An account with that email already exists.');
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        username,
        section,
        role: DEFAULT_USER_ROLE
      }
    }
  });

  if (error) {
    showMessage(`Signup failed: ${error.message}`);
    return;
  }

  const userId = data?.user?.id;
  if (userId) {
    const { error: insertError } = await supabase.from('users').insert([
      {
        id: userId,
        email,
        full_name: fullName,
        username,
        section,
        role: DEFAULT_USER_ROLE
      }
    ]);
    if (insertError) {
      console.warn('Failed to insert profile row', insertError);
    }
  }

  showMessage('Sign up complete. Please verify your email if required, then log in.');
  if (data?.session) {
    await notifyParentAuthUpdate();
    await closeParentLoginModal();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('.container');
  const infoButtons = document.querySelectorAll('.info-item .btn[data-mode]');
  const loginButton = document.getElementById('loginSubmitBtn');
  const signupButton = document.getElementById('signupSubmitBtn');
  const supabase = getSupabaseClient();

  if (!supabase) {
    console.warn('Supabase client could not be initialized inside login modal.');
  }

  infoButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (!container) {
        return;
      }

      const mode = button.getAttribute('data-mode');
      container.classList.toggle('log-in', mode === 'signup');
      container.classList.remove('active');
    });
  });

  if (loginButton) {
    loginButton.addEventListener('click', () => {
      if (!supabase) {
        showMessage('Supabase is not configured for this login modal.');
        return;
      }
      handleLogin(supabase);
    });
  }

  if (signupButton) {
    signupButton.addEventListener('click', () => {
      if (!supabase) {
        showMessage('Supabase is not configured for this login modal.');
        return;
      }
      handleSignup(supabase);
    });
  }
});
