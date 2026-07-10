const ADMIN_SUPABASE_URL = window.SUPABASE_URL || (import.meta && import.meta.env && import.meta.env.VITE_SUPABASE_URL);
const ADMIN_SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || (import.meta && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY);
const ADMIN_SUPABASE = (window.supabase && typeof window.supabase.createClient === 'function')
    ? window.supabase.createClient(ADMIN_SUPABASE_URL, ADMIN_SUPABASE_ANON_KEY)
    : null;

const adminAuthStatus = document.getElementById('adminAuthStatus');
const adminUserEmailHolder = document.getElementById('adminUserEmailHolder');
const adminUserEmail = document.getElementById('adminUserEmail');
const adminSignOutBtn = document.getElementById('adminSignOutBtn');
const adminUnauthMessage = document.getElementById('adminUnauthMessage');
const adminDenied = document.getElementById('adminDenied');
const adminContent = document.getElementById('adminContent');

function showAdminStatus(isSignedIn, email) {
    if (!adminAuthStatus || !adminUserEmailHolder || !adminSignOutBtn || !adminUnauthMessage || !adminDenied || !adminContent) return;

    if (isSignedIn) {
        adminAuthStatus.textContent = 'Signed in';
        adminUserEmailHolder.classList.remove('d-none');
        adminUnauthMessage.classList.add('d-none');
        adminSignOutBtn.classList.remove('d-none');
        adminUserEmail.textContent = email || 'Unknown user';
        adminDenied.classList.add('d-none');
        adminContent.classList.remove('d-none');
    } else {
        adminAuthStatus.textContent = 'Access Denied!';
        adminUserEmailHolder.classList.add('d-none');
        adminSignOutBtn.classList.add('d-none');
        adminUnauthMessage.classList.remove('d-none');
        adminDenied.classList.remove('d-none');
        adminContent.classList.add('d-none');
    }
}

async function checkAdminSession() {
    if (!ADMIN_SUPABASE) {
        showAdminStatus(false);
        return;
    }

    try {
        const { data, error } = await ADMIN_SUPABASE.auth.getSession();
        if (error || !data?.session) {
            showAdminStatus(false);
            return;
        }

        showAdminStatus(true, data.session.user.email || data.session.user.id);
    } catch (error) {
        console.warn('Admin page session check failed', error);
        showAdminStatus(false);
    }
}

if (adminSignOutBtn) {
    adminSignOutBtn.addEventListener('click', async () => {
        if (!ADMIN_SUPABASE) return;
        await ADMIN_SUPABASE.auth.signOut();
        showAdminStatus(false);
    });
}

checkAdminSession();
