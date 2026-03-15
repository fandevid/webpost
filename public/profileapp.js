
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
    import {
      getFirestore, collection, query, where, onSnapshot, orderBy, limit, startAfter, getDocs, doc, updateDoc, getDoc,
      addDoc, deleteDoc, serverTimestamp, arrayUnion, arrayRemove, runTransaction
    } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
    import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

    const firebaseConfig = {
      apiKey: "AIzaSyC7bPogwCQE_Pr0Nm-fCP7eyb6Xxm2s5hk",
      authDomain: "innerversse-web.firebaseapp.com",
      projectId: "innerversse-web",
      storageBucket: "innerversse-web.firebasestorage.app",
      messagingSenderId: "739895510202",
      appId: "1:739895510202:web:092e6b52558ce9a3b5ae83",
      measurementId: "G-ZYRXW1FCBB"
    };

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);

    // ===== helpers =====
    const sanitize = (str) => {
      if (!str) return "";
      const temp = document.createElement("div");
      temp.textContent = str;
      return temp.innerHTML;
    };

    const cleanText = (text) => {
      if (!text) return "";
      let t = String(text);
      t = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      t = t.replace(/[\u200B-\u200D\uFEFF]/g, "");
      t = t.replace(/\u00A0/g, " ");
      let lines = t.split("\n").map(l => l.trim());
      while (lines.length && lines[0] === "") lines.shift();
      while (lines.length && lines[lines.length - 1] === "") lines.pop();
      t = lines.join("\n");
      t = t.replace(/\n{3,}/g, "\n\n");
      return t.trim();
    };

    const toB64 = (str) => {
      const bytes = new TextEncoder().encode(str || "");
      let bin = "";
      bytes.forEach(b => bin += String.fromCharCode(b));
      return btoa(bin);
    };
    const fromB64 = (b64) => {
      const bin = atob(b64 || "");
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    };

    const ACCESSORIES = [
      { id: "none", className: "", badge: "" },
      { id: "glow", className: "acc-glow", badge: "GLOW" },
      { id: "sparkle", className: "acc-sparkle", badge: "SPARK" },
      { id: "rainbow", className: "acc-rainbow", badge: "RAINBOW" },
      { id: "aurora", className: "acc-aurora", badge: "AURORA" },
      { id: "cyber", className: "acc-cyber", badge: "CYBER" },
      { id: "glass", className: "acc-glass", badge: "GLASS" },
      { id: "firefly", className: "acc-firefly", badge: "FIREFLY" },
    ];
    const getAccessoryById = (id) => ACCESSORIES.find(a => a.id === id) || ACCESSORIES[0];

    // ===== params =====
    const params = new URLSearchParams(window.location.search);
    const targetUser = params.get("user");

    if (!targetUser) window.location.href = "index.html";

    // ===== UI =====
    const userPostsEl = document.getElementById("userPosts");
    const profileUsernameEl = document.getElementById("profileUsername");
    const profileIconEl = document.getElementById("profileIcon");
    const postCountEl = document.getElementById("postCount");
    const likeTotalEl = document.getElementById("likeTotal");
    const viewTotalEl = document.getElementById("viewTotal");
    const pageLoader = document.getElementById("pageLoader");

    profileUsernameEl.textContent = "@" + targetUser;
    profileIconEl.textContent = (targetUser?.[0] || "?").toUpperCase();
    document.title = `Profil @${targetUser} | Innerversse`;

    // ===== theme toggle (default dark) =====
    const themeBtn = document.getElementById("themeToggle");
    const setTheme = (mode) => {
      const isDark = mode === "dark";
      document.documentElement.classList.toggle("dark", isDark);
      localStorage.setItem("theme", mode);
      if (themeBtn) themeBtn.textContent = isDark ? "☀️" : "🌙";
    };
    const initTheme = () => {
      const saved = localStorage.getItem("theme");
      if (!saved) { setTheme("dark"); return; }
      setTheme(saved);
    };
    initTheme();
    themeBtn?.addEventListener("click", () => {
      const isDarkNow = document.documentElement.classList.contains("dark");
      setTheme(isDarkNow ? "light" : "dark");
    });

    // ===== auth state =====
    let currentUid = null;
    onAuthStateChanged(auth, (user) => {
      currentUid = user?.uid || null;
    });

    // ===== pagination state =====
    const POSTS_PER_PAGE = 5;
    let firstLoad = true;
    let lastDocSnap = null;
    let hasMore = true;
    let isLoading = false;

    // ===== totals realtime (dari semua post user, tanpa pagination) =====
    // NOTE: ini bisa berat kalau postingan user banyak. Tapi aman untuk skala kecil.
    const totalsQuery = query(collection(db, "posts"), where("username", "==", targetUser));
    onSnapshot(totalsQuery, (snap) => {
      postCountEl.textContent = `${snap.size} Postingan`;
      let likeSum = 0;
      let viewSum = 0;
      snap.forEach(d => {
        const data = d.data();
        likeSum += (typeof data.likeCount === "number" ? data.likeCount : (data.likesUid?.length || 0));
        viewSum += (data.views || 0);
      });
      likeTotalEl.textContent = `❤️ ${likeSum}`;
      viewTotalEl.textContent = `👁️ ${viewSum}`;
    });

    // ===== render card (ngikut index) =====
    const renderPostCard = (id, data) => {
      const raw = cleanText(data.content || "");
      const isLong = raw.length > 150;
      const preview = isLong ? raw.substring(0, 150) : raw;

      const likesUid = data.likesUid || [];
      const isLiked = currentUid && likesUid.includes(currentUid);
      const likeCountShow = (typeof data.likeCount === "number") ? data.likeCount : likesUid.length;

      const date = data.createdAt
        ? new Date(data.createdAt.seconds * 1000).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : '...';

      const acc = data.accessory || { id: "none" };
      const accData = getAccessoryById(acc.id);
      const accClass = accData.className || "";
      const badge = accData.badge
        ? `<span class="badge-acc bg-yellow-50 text-yellow-700 border border-yellow-100">${accData.badge}</span>`
        : "";

      const full64 = toB64(raw);
      const readMoreBtn = isLong
        ? `... <button class="btn-read-more text-blue-500 font-bold text-xs ml-1" data-full64="${full64}">Selengkapnya</button>`
        : '';

      const postTextHtml = `<p class="post-text text-gray-800 mt-3 whitespace-pre-line leading-7 break-words text-left">${sanitize(preview)}${readMoreBtn}</p>`;

      return `
        <div class="bg-white border border-gray-200 rounded-2xl p-5 mb-6 shadow-sm ${accClass}" data-post-id="${id}">
          <div class="card-inner">
            <div class="flex gap-3 items-start">
              <img src="${data.photo || ''}" class="w-12 h-12 rounded-full border bg-gray-50 flex-shrink-0">
              <div class="flex-grow min-w-0">
                <div class="flex justify-between items-start">
                  <div class="flex flex-col min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <a href="profile.html?user=${sanitize(data.username || 'anon')}" class="font-bold text-base text-gray-900 truncate hover:underline hover:text-blue-600">@${sanitize(data.username || 'anon')}</a>
                      <span class="bg-blue-50 text-blue-500 px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-blue-100">${sanitize(data.category || 'Umum')}</span>
                      ${badge}
                    </div>
                    <span class="text-gray-400 text-[10px]">${date}</span>
                  </div>

                  ${data.uid && currentUid && data.uid === currentUid
                    ? `<button data-id="${id}" class="btn-delete text-gray-300 hover:text-red-500 font-bold text-lg px-2">×</button>`
                    : ''
                  }
                </div>

                ${postTextHtml}

                ${data.imageUrl ? `<img src="${sanitize(data.imageUrl)}" class="mt-3 rounded-xl border border-gray-200 max-h-96 w-full object-cover">` : ''}

                ${data.spotifyUrl ? `
                  <div class="mt-3 rounded-xl overflow-hidden border border-gray-200">
                    <iframe
                      src="${sanitize(data.spotifyUrl)}"
                      width="100%"
                      height="152"
                      frameborder="0"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="lazy"
                      style="border-radius: 12px;">
                    </iframe>
                  </div>
                ` : ''}

                <div class="text-[10px] text-gray-400 mt-3">👁️ ${data.views || 0} tayangan</div>

                <div class="mt-4 flex gap-6 items-center border-t border-gray-100 pt-3 text-sm">
                  <button data-id="${id}" class="btn-like flex items-center gap-1.5 ${isLiked ? 'text-red-500' : 'text-gray-500'} font-bold transition">
                    <span class="text-lg">${isLiked ? '❤️' : '🤍'}</span> ${likeCountShow}
                  </button>
                  <button data-id="${id}" class="btn-toggle-cmt flex items-center gap-1.5 text-gray-500 font-bold transition">💬 Komentar</button>
                </div>

                <div id="comment-area-${id}" class="hidden mt-4 pt-4 border-t border-dashed border-gray-200 space-y-3">
                  <div id="cmt-list-${id}" class="space-y-2 max-h-48 overflow-y-auto"></div>
                  <div class="flex gap-2 items-center w-full">
                    <input id="cmt-input-${id}" type="text" placeholder="Tulis komentar..."
                      class="flex-1 min-w-0 bg-gray-100 border-none rounded-full px-4 py-2 outline-none focus:ring-2 focus:ring-blue-200 text-sm">
                    <button data-id="${id}" class="btn-send-cmt text-blue-500 font-bold text-sm px-2">Kirim</button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      `;
    };

    // ===== comments realtime per post =====
    const commentUnsubs = new Map();
    const stopCommentListener = (postId) => {
      const fn = commentUnsubs.get(postId);
      if (fn) { fn(); commentUnsubs.delete(postId); }
    };

    const renderCommentsRealtime = async (postId) => {
      stopCommentListener(postId);

      const listEl = document.getElementById(`cmt-list-${postId}`);
      if (!listEl) return;

      listEl.innerHTML = `<div class="text-xs text-gray-400 italic">Memuat komentar...</div>`;

      const qCmt = query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"));
      const unsub = onSnapshot(qCmt, (snap) => {
        listEl.innerHTML = snap.docs.map(d => {
          const c = d.data();
          const isMy = currentUid && c.uid === currentUid;

          return `
            <div class="text-sm bg-gray-50 p-2.5 rounded-xl border border-gray-100 flex justify-between items-start group transition">
              <div class="pr-2">
                <a href="profile.html?user=${sanitize(c.username || 'anon')}"
                   class="font-bold text-gray-900 hover:underline hover:text-blue-600">@${sanitize(c.username || 'anon')}</a>
                <span class="text-gray-700"> ${sanitize(c.text || '')}</span>
              </div>
              ${isMy ? `<button data-post-id="${postId}" data-cmt-id="${d.id}" class="btn-delete-cmt opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 font-bold px-2 transition">×</button>` : ''}
            </div>
          `;
        }).join('') || `<div class="text-xs text-gray-400 italic">Belum ada komentar.</div>`;
      }, (err) => {
        console.error("Komentar error:", err);
        listEl.innerHTML = `<div class="text-xs text-red-400 italic">Error memuat komentar</div>`;
      });

      commentUnsubs.set(postId, unsub);
    };

    // ===== load posts (pagination) =====
    const hideLoader = () => {
      if (!pageLoader) return;
      pageLoader.style.opacity = "0";
      pageLoader.style.transition = "opacity 0.25s ease-out";
      setTimeout(() => pageLoader.style.display = "none", 250);
    };

    const showEmpty = () => {
      userPostsEl.innerHTML = `<div class="p-10 text-center text-gray-400 italic">Belum ada postingan dari user ini.</div>`;
    };

    const appendLoadMoreBtn = () => {
      const existing = document.getElementById("loadMoreWrap");
      if (existing) existing.remove();

      if (!hasMore) {
        userPostsEl.insertAdjacentHTML("beforeend",
          `<div class="text-center py-6 text-gray-400 italic">✓ Semua postingan sudah dimuat</div>`
        );
        return;
      }

      userPostsEl.insertAdjacentHTML("beforeend", `
        <div id="loadMoreWrap" class="text-center py-6">
          <button id="btnLoadMore"
            class="bg-white border border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white px-8 py-3 rounded-full font-bold transition shadow-sm">
            📥 Muat Postingan Lainnya
          </button>
        </div>
      `);

      document.getElementById("btnLoadMore")?.addEventListener("click", loadMore);
    };

    const loadFirst = async () => {
      isLoading = true;
      userPostsEl.innerHTML = `<div class="p-10 text-center text-gray-400 italic">Memuat postingan...</div>`;

      try {
        const qFirst = query(
          collection(db, "posts"),
          where("username", "==", targetUser),
          orderBy("createdAt", "desc"),
          limit(POSTS_PER_PAGE)
        );

        const snap = await getDocs(qFirst);
        hideLoader();

        if (snap.empty) { hasMore = false; showEmpty(); return; }

        lastDocSnap = snap.docs[snap.docs.length - 1];
        hasMore = snap.docs.length === POSTS_PER_PAGE;

        userPostsEl.innerHTML = snap.docs.map(d => renderPostCard(d.id, d.data())).join("");
        appendLoadMoreBtn();

      } catch (e) {
        console.error("Load first error:", e);
        hideLoader();
        userPostsEl.innerHTML = `
          <div class="p-8 text-center text-red-400 italic">
            Gagal memuat profil. Cek console.<br/>
            <span class="text-xs text-gray-400">(Biasanya butuh Firestore Index untuk where+orderBy)</span>
          </div>`;
      } finally {
        isLoading = false;
      }
    };

    const loadMore = async () => {
      if (isLoading) return;
      if (!hasMore) return;
      if (!lastDocSnap) return;

      isLoading = true;
      const btn = document.getElementById("btnLoadMore");
      if (btn) { btn.disabled = true; btn.textContent = "⏳ Memuat..."; }

      try {
        const qMore = query(
          collection(db, "posts"),
          where("username", "==", targetUser),
          orderBy("createdAt", "desc"),
          startAfter(lastDocSnap),
          limit(POSTS_PER_PAGE)
        );

        const snap = await getDocs(qMore);
        if (snap.empty) {
          hasMore = false;
          appendLoadMoreBtn();
          return;
        }

        lastDocSnap = snap.docs[snap.docs.length - 1];
        hasMore = snap.docs.length === POSTS_PER_PAGE;

        // remove load more wrap, append cards, then append button again
        document.getElementById("loadMoreWrap")?.remove();

        const html = snap.docs.map(d => renderPostCard(d.id, d.data())).join("");
        userPostsEl.insertAdjacentHTML("beforeend", html);

        appendLoadMoreBtn();
      } catch (e) {
        console.error("Load more error:", e);
        alert("Gagal memuat postingan lainnya. Cek console.");
        if (btn) { btn.disabled = false; btn.textContent = "📥 Muat Postingan Lainnya"; }
      } finally {
        isLoading = false;
      }
    };

    // ===== like / delete / comment actions =====
    userPostsEl.addEventListener("click", async (e) => {
      // delete comment
      if (e.target.closest(".btn-delete-cmt")) {
        const btn = e.target.closest(".btn-delete-cmt");
        const postId = btn.dataset.postId;
        const cmtId = btn.dataset.cmtId;
        if (!confirm("Hapus komentar ini?")) return;

        try {
          await deleteDoc(doc(db, "posts", postId, "comments", cmtId));
        } catch (err) {
          console.error("Gagal hapus komentar:", err);
          alert("Gagal hapus komentar. Cek console.");
        }
        return;
      }

      // delete post
      if (e.target.closest(".btn-delete")) {
        const id = e.target.closest(".btn-delete").dataset.id;
        if (!confirm("Hapus postingan ini?")) return;

        try {
          await deleteDoc(doc(db, "posts", id));
          // refresh halaman biar rapi
          location.reload();
        } catch (err) {
          console.error("Gagal hapus postingan:", err);
          alert("Gagal hapus postingan. Cek console.");
        }
        return;
      }

      // like toggle
      if (e.target.closest(".btn-like")) {
        if (!currentUid) return alert("Login dulu!");
        const btn = e.target.closest(".btn-like");
        const id = btn.dataset.id;
        if (btn.dataset.busy === "1") return;
        btn.dataset.busy = "1";

        try {
          const postRef = doc(db, "posts", id);
          const snap = await getDoc(postRef);
          if (!snap.exists()) return;

          const data = snap.data();
          const likesUid = data.likesUid || [];
          const isLiked = likesUid.includes(currentUid);

          await updateDoc(postRef, {
            likesUid: isLiked ? arrayRemove(currentUid) : arrayUnion(currentUid),
            likeCount: isLiked ? Math.max((data.likeCount || 1) - 1, 0) : (data.likeCount || 0) + 1
          });

          // UI optimistik ringan
          const heart = btn.querySelector("span");
          if (heart) heart.textContent = isLiked ? "🤍" : "❤️";
        } catch (err) {
          console.error("Gagal like:", err);
        } finally {
          btn.dataset.busy = "0";
        }
        return;
      }

      // toggle comments
      if (e.target.closest(".btn-toggle-cmt")) {
        const id = e.target.closest(".btn-toggle-cmt").dataset.id;
        const area = document.getElementById(`comment-area-${id}`);
        if (!area) return;
        area.classList.toggle("hidden");
        if (!area.classList.contains("hidden")) renderCommentsRealtime(id);
        else stopCommentListener(id);
        return;
      }

      // send comment
      if (e.target.closest(".btn-send-cmt")) {
        if (!currentUid) return alert("Login dulu!");
        const id = e.target.closest(".btn-send-cmt").dataset.id;
        const input = document.getElementById(`cmt-input-${id}`);
        if (!input) return;

        const text = cleanText(input.value);
        if (!text) return;

        try {
          await addDoc(collection(db, "posts", id, "comments"), {
            uid: currentUid,
            username: targetUser, // kamu bisa ganti ke username asli yg login kalau mau
            text,
            createdAt: serverTimestamp()
          });
          input.value = "";
        } catch (err) {
          console.error("Gagal komentar:", err);
        }
        return;
      }

      // read more
      if (e.target.classList.contains("btn-read-more")) {
        try {
          const full = cleanText(fromB64(e.target.dataset.full64 || ""));
          const p = e.target.closest("p");
          if (p) {
            p.textContent = full;
            p.classList.add("whitespace-pre-line");
          }
        } catch (err) {
          console.error("Read more error:", err);
        }
        return;
      }
    });

    // init
    loadFirst();
