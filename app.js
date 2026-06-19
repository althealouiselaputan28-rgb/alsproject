/* Client entry script — uses dynamic import for Supabase so the page still runs on plain static servers */
(async function() {
    let supabase = null;

    try {
        const mod = await import('@supabase/supabase-js');
        const createClient = mod.createClient;
        const SUPABASE_URL = (import.meta && import.meta.env) ? import.meta.env.VITE_SUPABASE_URL : undefined;
        const SUPABASE_ANON_KEY = (import.meta && import.meta.env) ? import.meta.env.VITE_SUPABASE_ANON_KEY : undefined;

        if (SUPABASE_URL && SUPABASE_ANON_KEY) {
            supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
    } catch (err) {
        console.warn('Dynamic import of @supabase/supabase-js failed — will try CDN/global fallback if present.', err);
    }

    // CDN/global fallback: if the UMD script is included and global variables are provided
    let activeSupabaseUrl = null;
    let activeSupabaseKey = null;
    if (!supabase) {
        const SUPABASE_URL = window.SUPABASE_URL || (import.meta && import.meta.env && import.meta.env.VITE_SUPABASE_URL);
        const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || (import.meta && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY);
        activeSupabaseUrl = SUPABASE_URL;
        activeSupabaseKey = SUPABASE_ANON_KEY;
        if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
            try {
                supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                console.info('Supabase initialized via CDN/global fallback.');
            } catch (e) {
                console.warn('CDN/global Supabase initialization failed.', e);
            }
        }
    }

    console.group('Supabase debug');
    console.log('Supabase available:', !!supabase);
    if (supabase) {
        console.log('Active Supabase URL:', activeSupabaseUrl || (import.meta && import.meta.env && import.meta.env.VITE_SUPABASE_URL));
    }
    console.groupEnd();

    // Initialize Quill (script included in index.html)
    let quill = null;
    try {
        quill = new Quill('#editor-container', {
            theme: 'snow',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline'],
                    [{ color: [] }, { background: [] }],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    ['link', 'image'],
                    ['clean']
                ]
            }
        });
    } catch (e) {
        console.warn('Quill not available or editor not on page.', e);
    }

    // DOM handles
    const authBtn = document.getElementById('authBtn');
    const createPostBtn = document.getElementById('createPostBtn');
    const publishPostBtn = document.getElementById('publishPostBtn');
    const postTitleInput = document.getElementById('postTitle');
    const articleFeed = document.getElementById('articleFeed');
    const feedLoader = document.getElementById('feedLoader');
    const navbarLinks = document.querySelectorAll('[data-page]');
    const pages = {
        home: document.getElementById('homePage'),
        information: document.getElementById('informationPage'),
        roster: document.getElementById('rosterPage')
    };

    // safe modal init
    let bootstrapModal = null;
    try {
        bootstrapModal = new bootstrap.Modal(document.getElementById('editorModal'));
    } catch (e) {
        console.warn('Bootstrap modal not available.', e);
    }

    function activatePage(pageKey, updateHash = true) {
        if (!pageKey || !pages[pageKey]) pageKey = 'home';

        navbarLinks.forEach(nav => {
            nav.classList.toggle('active', nav.dataset.page === pageKey);
        });

        Object.keys(pages).forEach(key => {
            pages[key].classList.toggle('active-section', key === pageKey);
        });

        if (updateHash) window.location.hash = `#${pageKey}`;
    }

    function updateAuthButton(session) {
        if (!authBtn) return;
        if (session && session.user) {
            authBtn.textContent = 'Logout';
            authBtn.classList.replace('btn-outline-danger', 'btn-danger');
            if (createPostBtn) createPostBtn.classList.remove('d-none');
        } else {
            authBtn.textContent = 'Login';
            authBtn.classList.replace('btn-danger', 'btn-outline-danger');
            if (createPostBtn) createPostBtn.classList.add('d-none');
        }
    }

    async function checkSessionState() {
        if (!supabase) {
            updateAuthButton(null);
            return null;
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) {
            console.error('Session retrieval error', error);
            updateAuthButton(null);
            return null;
        }

        updateAuthButton(data.session);
        return data.session;
    }

    // Auth button behavior (guarded)
    if (authBtn) {
        authBtn.addEventListener('click', async () => {
            if (!supabase) {
                alert('Authentication is unavailable on this static server.');
                return;
            }

            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) {
                console.error('Session check error', sessionError);
            }

            if (session) {
                await supabase.auth.signOut();
                updateAuthButton(null);
                window.location.reload();
                return;
            }

            const email = prompt('Enter Administration Identity Domain Email:');
            const password = prompt('Enter Password Credential Key Sequence:');
            if (!email || !password) {
                return;
            }

            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            console.log('SignIn response', data, error);
            if (error) {
                alert(`Access Rejected: ${error.message}`);
                return;
            }

            await checkSessionState();
            window.location.reload();
        });
    }

    if (supabase && supabase.auth && typeof supabase.auth.onAuthStateChange === 'function') {
        supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth state change:', event, session);
            updateAuthButton(session);
        });
    }

    // Navigation links
    if (navbarLinks && navbarLinks.length) {
        navbarLinks.forEach(link => {
            link.addEventListener('click', event => {
                event.preventDefault();
                const page = link.dataset.page;
                if (!page || !pages[page]) return;
                activatePage(page);
            });
        });

        window.addEventListener('hashchange', () => {
            const page = window.location.hash.replace('#', '');
            activatePage(page, false);
        });

        // activate from hash or default
        activatePage(window.location.hash.replace('#', '') || 'home', false);
    }

    // Fetch articles (guarded)
    async function fetchArticles() {
        if (!supabase) {
            if (feedLoader) feedLoader.textContent = 'Offline mode — articles unavailable.';
            return;
        }

        try {
            const { data: articles, error } = await supabase
                .from('articles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                if (feedLoader) feedLoader.textContent = 'Failed to synchronize operational intelligence array.';
                console.error(error);
                return;
            }

            if (!articles || articles.length === 0) {
                if (feedLoader) feedLoader.textContent = 'No field updates published at this time.';
                return;
            }

            if (feedLoader) feedLoader.remove();
            if (articleFeed) articleFeed.innerHTML = '';

            articles.forEach(article => {
                const dateStr = new Date(article.created_at).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric'
                });

                const newArticle = document.createElement('article');
                newArticle.className = 'card custom-card mb-4';
                newArticle.innerHTML = `
                    <div class="card-body p-4">
                        <h3 class="card-title h4 text-white fw-bold">${article.title}</h3>
                        <p class="text-secondary small">Published on: ${dateStr}</p>
                        <div class="card-text text-light">${article.content}</div>
                    </div>
                `;

                articleFeed.appendChild(newArticle);
            });
        } catch (e) {
            console.error('Error fetching articles', e);
            if (feedLoader) feedLoader.textContent = 'Failed to load articles.';
        }
    }

    // Publish handler (guarded)
    if (publishPostBtn) {
        publishPostBtn.addEventListener('click', async () => {
            if (!supabase) {
                alert('Cannot publish without Supabase configured.');
                return;
            }

            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session) {
                alert('You must be signed in to publish.');
                publishPostBtn.disabled = false;
                publishPostBtn.textContent = 'Publish Post';
                return;
            }

            const title = (postTitleInput && postTitleInput.value) ? postTitleInput.value.trim() : '';
            const contentHTML = quill ? quill.root.innerHTML : '';

            if (!title || contentHTML === '<p><br></p>' || !contentHTML) {
                alert('All fields must be filled prior to content authorization.');
                return;
            }

            publishPostBtn.disabled = true;
            publishPostBtn.textContent = 'Transmitting...';

            const { error } = await supabase
                .from('articles')
                .insert([{ title, content: contentHTML, created_by: session.user.id }]);

            if (error) {
                alert(`Transmission Error encountered: ${error.message}`);
            } else {
                if (postTitleInput) postTitleInput.value = '';
                if (quill) quill.setText('');
                if (bootstrapModal) bootstrapModal.hide();
                await fetchArticles();
            }

            publishPostBtn.disabled = false;
            publishPostBtn.textContent = 'Publish Post';
        });
    }

    // Initial run
    fetchArticles();
    await checkSessionState();
    await fetchRoster();

    // Roster: fetch and display
    async function fetchRoster() {
            const rosterList = document.getElementById('rosterList');
            if (!rosterList) return;

            rosterList.innerHTML = '';

            if (!supabase) {
                rosterList.innerHTML = '<div class="col-12 text-secondary">Roster unavailable in offline mode.</div>';
                return;
            }

            try {
                const { data, error } = await supabase.from('roster').select('*').order('created_at', { ascending: false });
                if (error) {
                    rosterList.innerHTML = `<div class="col-12 text-danger">Failed to load roster: ${error.message}</div>`;
                    return;
                }

                if (!data || data.length === 0) {
                    rosterList.innerHTML = '<div class="col-12 text-secondary">No roster entries yet.</div>';
                    return;
                }

                data.forEach(item => {
                    const col = document.createElement('div');
                    col.className = 'col-md-4 col-sm-6';
                    const card = document.createElement('div');
                    card.className = 'p-3 rounded bg-dark border border-secondary text-center';
                    const img = document.createElement('img');
                    img.src = item.image_url || '';
                    img.alt = item.name || '';
                    img.style.maxWidth = '100%';
                    img.style.height = '180px';
                    img.style.objectFit = 'cover';
                    img.className = 'mb-2 rounded';
                    const name = document.createElement('div');
                    name.className = 'text-white fw-bold';
                    name.textContent = item.name || 'Unnamed';
                    card.appendChild(img);
                    card.appendChild(name);
                    col.appendChild(card);
                    rosterList.appendChild(col);
                });
            } catch (e) {
                rosterList.innerHTML = '<div class="col-12 text-danger">Error loading roster.</div>';
                console.error(e);
            }
        }

        // Hook Add Student form
        const addStudentForm = document.getElementById('addStudentForm');
        const addStudentBtn = document.getElementById('addStudentBtn');
        if (addStudentForm) {
            addStudentForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!supabase) {
                    alert('Cannot upload — Supabase not configured on this server.');
                    return;
                }

                const nameInput = document.getElementById('studentName');
                const fileInput = document.getElementById('studentPhoto');
                const file = fileInput.files[0];
                const name = nameInput.value.trim();

                if (!name || !file) {
                    alert('Please provide a name and photo.');
                    return;
                }

                const safeFileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
                const filename = `roster/${Date.now()}_${safeFileName}`;
                console.log('Uploading file path', filename, 'bucket roster-photos');
                try {
                    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                    console.log('Upload session', session, sessionError);
                    if (sessionError || !session) {
                        throw new Error('Admin session not found.');
                    }

                    const { data: uploadData, error: uploadError } = await supabase.storage.from('roster-photos').upload(filename, file, { cacheControl: '3600', upsert: false });
                    console.log('Storage upload result', uploadData, uploadError);
                    if (uploadError) {
                        console.error('Storage upload error details', uploadError);
                        throw uploadError;
                    }

                    const { data: publicUrlData, error: publicUrlError } = supabase.storage.from('roster-photos').getPublicUrl(filename);
                    if (publicUrlError) {
                        console.error('Public URL error', publicUrlError);
                        throw publicUrlError;
                    }
                    const imageUrl = publicUrlData.publicUrl;

                    const { error: dbError } = await supabase.from('roster').insert([{ name, image_url: imageUrl, created_by: session.user.id }]);
                    if (dbError) throw dbError;

                    // clear and close modal
                    nameInput.value = '';
                    fileInput.value = '';
                    const modal = bootstrap.Modal.getInstance(document.getElementById('addStudentModal'));
                    if (modal) modal.hide();
                    await fetchRoster();
                } catch (err) {
                    if (err && err.status) {
                        console.error('Upload failed with status', err.status, err.message, err);
                        console.log('message:', err.message);
                        console.log('status:', err.status);
                        console.log('name:', err.name);
                        console.log('error json:', JSON.stringify(err, null, 2));
                    } else {
                        console.error('Upload error', err);
                    }
                    alert(err?.message || 'Upload failed');
                }
            });
        }

        // Expose fetchRoster to initial run
        fetchRoster();

        // Show admin-only UI when signed in
        async function updateAuthUI() {
            const addBtn = document.getElementById('addStudentBtn');
            const createBtn = document.getElementById('createPostBtn');
            if (!supabase) {
                if (addBtn) addBtn.classList.add('d-none');
                if (createBtn) createBtn.classList.add('d-none');
                return;
            }

            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    if (addBtn) addBtn.classList.remove('d-none');
                    if (createBtn) createBtn.classList.remove('d-none');
                } else {
                    if (addBtn) addBtn.classList.add('d-none');
                    if (createBtn) createBtn.classList.add('d-none');
                }
            } catch (e) {
                console.warn('Failed to check session', e);
                if (addBtn) addBtn.classList.add('d-none');
            }
        }

        updateAuthUI();

})();
