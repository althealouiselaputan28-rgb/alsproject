import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Supabase environment variables are not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

// 2. Initialize Quill WYSIWYG Framework
const quill = new Quill('#editor-container', {
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

    const authBtn = document.getElementById('authBtn');
const createPostBtn = document.getElementById('createPostBtn');
const publishPostBtn = document.getElementById('publishPostBtn');
const postTitleInput = document.getElementById('postTitle');
const articleFeed = document.getElementById('articleFeed');
const feedLoader = document.getElementById('feedLoader');
const bootstrapModal = new bootstrap.Modal(document.getElementById('editorModal'));

async function checkUserSession() {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
        console.error('Unable to verify session:', error.message);
        return;
    }

    if (session) {
        authBtn.textContent = 'Logout';
        authBtn.classList.replace('btn-outline-danger', 'btn-danger');
        createPostBtn.classList.remove('d-none');
    } else {
        authBtn.textContent = 'Login';
        authBtn.classList.replace('btn-danger', 'btn-outline-danger');
        createPostBtn.classList.add('d-none');
    }
}

authBtn.addEventListener('click', async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
        await supabase.auth.signOut();
        window.location.reload();
    } else {
        const email = prompt('Enter Administration Identity Domain Email:');
        const password = prompt('Enter Password Credential Key Sequence:');

        if (email && password) {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) alert(`Access Rejected: ${error.message}`);
            else window.location.reload();
        }
    }
});

async function fetchArticles() {
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
    articleFeed.innerHTML = '';

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
}

publishPostBtn.addEventListener('click', async () => {
    const title = postTitleInput.value.trim();
    const contentHTML = quill.root.innerHTML;

    if (!title || contentHTML === '<p><br></p>') {
        alert('All fields must be filled prior to content authorization.');
        return;
    }

    publishPostBtn.disabled = true;
    publishPostBtn.textContent = 'Transmitting...';

    const { error } = await supabase
        .from('articles')
        .insert([{ title, content: contentHTML }]);

    if (error) {
        alert(`Transmission Error encountered: ${error.message}`);
    } else {
        postTitleInput.value = '';
        quill.setText('');
        bootstrapModal.hide();
        await fetchArticles();
    }

    publishPostBtn.disabled = false;
    publishPostBtn.textContent = 'Publish Post';
});

checkUserSession();
fetchArticles();