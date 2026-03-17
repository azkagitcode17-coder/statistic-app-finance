/**
 * script.js — FinTrack Personal Finance Tracker
 * ================================================
 * Firebase Web SDK Modular (v10)
 * Fitur:
 *  - CRUD transaksi dengan Firestore
 *  - Kalkulasi saldo, pemasukan, pengeluaran
 *  - Grafik statistik (Bar, Line, Donut) dengan Chart.js
 *  - Filter berdasarkan tipe & bulan
 *  - Toast notification & modal konfirmasi
 * ================================================
 */

// ================================================================
// 1. FIREBASE CONFIGURATION
// ================================================================
// ⚠️  GANTI DENGAN KONFIGURASI FIREBASE PROJECT ANDA
// Dapatkan dari: Firebase Console → Project Settings → Web App
// Langkah: https://firebase.google.com/docs/web/setup

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ⬇️  GANTI BAGIAN INI DENGAN CONFIG FIREBASE ANDA ⬇️
const firebaseConfig = {
    apiKey: "AIzaSyDXlf4lATJccclr_KqRNq5BsN9gz8dAUHs",
    authDomain: "statistic-app-finance-a543f.firebaseapp.com",
    projectId: "statistic-app-finance-a543f",
    storageBucket: "statistic-app-finance-a543f.firebasestorage.app",
    messagingSenderId: "270890707834",
    appId: "1:270890707834:web:987396b916b4d2fb2484c3"
  };
// ⬆️  SAMPAI SINI ⬆️

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);

// Inisialisasi Firestore
const db = getFirestore(app);

// Referensi koleksi "transactions" di Firestore
const txCollectionRef = collection(db, "transactions");


// ================================================================
// 2. STATE APLIKASI
// ================================================================
let allTransactions  = [];  // semua transaksi dari Firestore (array of objects)
let filteredTx       = [];  // transaksi setelah filter diterapkan
let currentType      = "income";  // tipe yang sedang dipilih di form
let deleteTargetId   = null;       // ID dokumen yang akan dihapus
let financeChart     = null;       // instance Chart.js
let currentChartType = "bar";      // 'bar' | 'line' | 'doughnut'


// ================================================================
// 3. INISIALISASI SAAT DOKUMEN DIMUAT
// ================================================================
document.addEventListener("DOMContentLoaded", () => {
  // Set tanggal default form = hari ini
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("input-date").value = today;

  // Tampilkan tahun di footer
  document.getElementById("footer-year").textContent = new Date().getFullYear();

  // Mulai mendengarkan perubahan real-time dari Firestore
  subscribeToTransactions();
});


// ================================================================
// 4. REALTIME LISTENER — FIRESTORE
// ================================================================
/**
 * Berlangganan perubahan koleksi "transactions" secara real-time.
 * onSnapshot() akan dipanggil setiap kali data berubah di Firestore.
 */
function subscribeToTransactions() {
  // Query: urutkan berdasarkan tanggal terbaru
  const q = query(txCollectionRef, orderBy("date", "desc"));

  onSnapshot(
    q,
    (snapshot) => {
      // Konversi snapshot dokumen menjadi array objek
      allTransactions = snapshot.docs.map((docSnap) => ({
        id:          docSnap.id,
        description: docSnap.data().description,
        amount:      docSnap.data().amount,
        type:        docSnap.data().type,       // 'income' | 'expense'
        date:        docSnap.data().date,       // format "YYYY-MM-DD"
        createdAt:   docSnap.data().createdAt,  // Timestamp Firestore
      }));

      // Sembunyikan loading overlay setelah data pertama kali diterima
      hideLoadingOverlay();

      // Terapkan filter dan render ulang UI
      applyFilters();
    },
    (error) => {
      // Tangani error koneksi atau izin Firestore
      console.error("Firestore error:", error);
      hideLoadingOverlay();
      showToast("Gagal memuat data: " + error.message, "error");
    }
  );
}


// ================================================================
// 5. TAMBAH TRANSAKSI
// ================================================================
/**
 * Mengambil nilai dari form, validasi, lalu menyimpan ke Firestore.
 * Dipanggil oleh onclick="addTransaction()" di index.html.
 */
window.addTransaction = async function () {
  // Ambil nilai input
  const description = document.getElementById("input-desc").value.trim();
  const amountRaw   = document.getElementById("input-amount").value;
  const date        = document.getElementById("input-date").value;
  const type        = currentType; // 'income' atau 'expense'

  // ── Validasi ──
  if (!description) {
    showFormMessage("Deskripsi tidak boleh kosong.", "error");
    document.getElementById("input-desc").focus();
    return;
  }

  const amount = parseFloat(amountRaw);
  if (!amountRaw || isNaN(amount) || amount <= 0) {
    showFormMessage("Masukkan jumlah yang valid (> 0).", "error");
    document.getElementById("input-amount").focus();
    return;
  }

  if (!date) {
    showFormMessage("Pilih tanggal transaksi.", "error");
    return;
  }

  // ── Nonaktifkan tombol saat proses simpan ──
  const btnAdd = document.getElementById("btn-add");
  btnAdd.disabled = true;
  btnAdd.textContent = "Menyimpan…";

  try {
    // Simpan dokumen baru ke Firestore
    await addDoc(txCollectionRef, {
      description,
      amount,
      type,
      date,                          // "YYYY-MM-DD"
      createdAt: Timestamp.now(),    // waktu server Firestore
    });

    // Reset form setelah berhasil
    document.getElementById("input-desc").value   = "";
    document.getElementById("input-amount").value = "";
    // Biarkan tanggal tetap sama agar mudah input berulang

    showFormMessage("Transaksi berhasil ditambahkan!", "success");
    showToast("Transaksi ditambahkan ✓", "success");

    // Hapus pesan setelah 3 detik
    setTimeout(() => showFormMessage("", ""), 3000);

  } catch (err) {
    console.error("Gagal menambah transaksi:", err);
    showFormMessage("Gagal menyimpan: " + err.message, "error");
    showToast("Gagal menyimpan transaksi", "error");
  } finally {
    // Aktifkan kembali tombol
    btnAdd.disabled = false;
    btnAdd.innerHTML = '<span class="btn-icon">+</span> Tambah Transaksi';
  }
};


// ================================================================
// 6. HAPUS TRANSAKSI
// ================================================================
/**
 * Buka modal konfirmasi sebelum menghapus.
 * @param {string} id - ID dokumen Firestore
 */
window.openDeleteModal = function (id) {
  deleteTargetId = id;
  document.getElementById("modal-overlay").classList.add("active");
};

/** Tutup modal konfirmasi. */
window.closeDeleteModal = function () {
  deleteTargetId = null;
  document.getElementById("modal-overlay").classList.remove("active");
};

/** Konfirmasi hapus — dipanggil saat user klik tombol "Hapus" di modal. */
window.confirmDelete = async function () {
  if (!deleteTargetId) return;

  try {
    // Hapus dokumen dari Firestore berdasarkan ID
    await deleteDoc(doc(db, "transactions", deleteTargetId));
    showToast("Transaksi dihapus.", "info");
  } catch (err) {
    console.error("Gagal menghapus:", err);
    showToast("Gagal menghapus transaksi: " + err.message, "error");
  } finally {
    closeDeleteModal();
  }
};


// ================================================================
// 7. FILTER TRANSAKSI
// ================================================================
/**
 * Menerapkan filter tipe dan bulan ke allTransactions,
 * lalu merender ulang daftar & ringkasan.
 */
window.applyFilters = function () {
  const filterType  = document.getElementById("filter-type").value;   // 'all' | 'income' | 'expense'
  const filterMonth = document.getElementById("filter-month").value;   // "" | "YYYY-MM"

  filteredTx = allTransactions.filter((tx) => {
    const matchType  = filterType === "all" || tx.type === filterType;
    const matchMonth = !filterMonth || tx.date.startsWith(filterMonth);
    return matchType && matchMonth;
  });

  renderTransactionList(filteredTx);
  renderSummary(filteredTx);
  renderChart(filteredTx);
};

/** Reset semua filter ke nilai awal. */
window.resetFilters = function () {
  document.getElementById("filter-type").value  = "all";
  document.getElementById("filter-month").value = "";
  applyFilters();
};


// ================================================================
// 8. RENDER DAFTAR TRANSAKSI
// ================================================================
/**
 * Mengisi elemen <ul id="transaction-list"> dengan item transaksi.
 * @param {Array} transactions - array objek transaksi yang akan ditampilkan
 */
function renderTransactionList(transactions) {
  const list      = document.getElementById("transaction-list");
  const emptyEl   = document.getElementById("empty-state");
  const countEl   = document.getElementById("tx-count");

  // Hapus konten sebelumnya (kecuali empty state)
  list.innerHTML = "";

  // Update jumlah transaksi
  countEl.textContent = `${transactions.length} transaksi`;

  // Tampilkan empty state jika tidak ada transaksi
  if (transactions.length === 0) {
    list.appendChild(createEmptyState());
    return;
  }

  // Render setiap transaksi
  transactions.forEach((tx) => {
    const isIncome = tx.type === "income";
    const li = document.createElement("li");
    li.className = `transaction-item tx-${tx.type}`;
    li.dataset.id = tx.id;

    li.innerHTML = `
      <div class="tx-type-icon">${isIncome ? "↑" : "↓"}</div>
      <div class="tx-info">
        <p class="tx-desc" title="${escapeHtml(tx.description)}">${escapeHtml(tx.description)}</p>
        <p class="tx-date">${formatDate(tx.date)}</p>
      </div>
      <span class="tx-amount">${isIncome ? "+" : "−"}${formatCurrency(tx.amount)}</span>
      <button
        class="tx-delete-btn"
        onclick="openDeleteModal('${tx.id}')"
        title="Hapus transaksi"
        aria-label="Hapus transaksi ${escapeHtml(tx.description)}"
      >✕</button>
    `;

    list.appendChild(li);
  });
}

/** Membuat elemen empty state. */
function createEmptyState() {
  const li = document.createElement("li");
  li.className = "empty-state";
  li.id = "empty-state";
  li.innerHTML = `
    <span class="empty-icon">📂</span>
    <p>Tidak ada transaksi.</p>
    <p class="empty-hint">Coba ubah filter atau tambah transaksi baru.</p>
  `;
  return li;
}


// ================================================================
// 9. RENDER RINGKASAN SALDO
// ================================================================
/**
 * Kalkulasi dan tampilkan total saldo, pemasukan, dan pengeluaran.
 * @param {Array} transactions
 */
function renderSummary(transactions) {
  // Hitung total pemasukan dari semua transaksi bertipe "income"
  const totalIncome = transactions
    .filter((tx) => tx.type === "income")
    .reduce((sum, tx) => sum + tx.amount, 0);

  // Hitung total pengeluaran dari semua transaksi bertipe "expense"
  const totalExpense = transactions
    .filter((tx) => tx.type === "expense")
    .reduce((sum, tx) => sum + tx.amount, 0);

  // Saldo = pemasukan - pengeluaran
  const balance = totalIncome - totalExpense;

  // Update teks di DOM
  document.getElementById("total-balance").textContent = formatCurrency(balance);
  document.getElementById("total-income").textContent  = formatCurrency(totalIncome);
  document.getElementById("total-expense").textContent = formatCurrency(totalExpense);

  // Warna saldo: hijau jika positif, merah jika negatif
  const balanceEl = document.getElementById("total-balance");
  balanceEl.classList.toggle("negative", balance < 0);

  // Perbarui progress bar saldo
  const fillEl = document.getElementById("balance-bar-fill");
  if (totalIncome > 0) {
    const pct = Math.min((totalIncome / (totalIncome + totalExpense)) * 100, 100);
    fillEl.style.width = pct + "%";
  } else {
    fillEl.style.width = "0%";
  }
}


// ================================================================
// 10. CHART.JS — STATISTIK KEUANGAN
// ================================================================
/**
 * Membangun dan merender grafik berdasarkan data transaksi.
 * Grafik dapat berupa: 'bar', 'line', atau 'doughnut'.
 * @param {Array} transactions
 */
function renderChart(transactions) {
  const canvas = document.getElementById("finance-chart");
  const ctx    = canvas.getContext("2d");

  // Hancurkan grafik sebelumnya agar tidak terjadi overlap
  if (financeChart) {
    financeChart.destroy();
    financeChart = null;
  }

  if (currentChartType === "doughnut") {
    renderDoughnutChart(ctx, transactions);
  } else {
    renderTimeChart(ctx, transactions);
  }
}

/**
 * Grafik Bar / Line — data pemasukan dan pengeluaran per tanggal.
 */
function renderTimeChart(ctx, transactions) {
  // Kumpulkan semua tanggal unik (sorted ascending)
  const dateSet = new Set(transactions.map((tx) => tx.date));
  const dates   = Array.from(dateSet).sort();

  if (dates.length === 0) {
    document.getElementById("chart-note").textContent = "Belum ada data untuk ditampilkan.";
    return;
  }

  // Hitung total income dan expense per tanggal
  const incomeData  = dates.map((d) =>
    transactions
      .filter((tx) => tx.date === d && tx.type === "income")
      .reduce((sum, tx) => sum + tx.amount, 0)
  );

  const expenseData = dates.map((d) =>
    transactions
      .filter((tx) => tx.date === d && tx.type === "expense")
      .reduce((sum, tx) => sum + tx.amount, 0)
  );

  // Label tanggal yang ramah dibaca (DD/MM)
  const labels = dates.map((d) => formatDateShort(d));

  document.getElementById("chart-note").textContent =
    `Menampilkan ${dates.length} hari • ${transactions.length} transaksi`;

  financeChart = new Chart(ctx, {
    type: currentChartType, // 'bar' atau 'line'
    data: {
      labels,
      datasets: [
        {
          label:           "Pemasukan",
          data:            incomeData,
          backgroundColor: "rgba(34, 197, 94, 0.20)",
          borderColor:     "rgba(34, 197, 94, 0.85)",
          borderWidth:     2,
          borderRadius:    currentChartType === "bar" ? 6 : 0,
          tension:         0.4,
          fill:            currentChartType === "line",
          pointBackgroundColor: "rgba(34, 197, 94, 1)",
          pointRadius:     4,
        },
        {
          label:           "Pengeluaran",
          data:            expenseData,
          backgroundColor: "rgba(244, 63, 94, 0.20)",
          borderColor:     "rgba(244, 63, 94, 0.85)",
          borderWidth:     2,
          borderRadius:    currentChartType === "bar" ? 6 : 0,
          tension:         0.4,
          fill:            currentChartType === "line",
          pointBackgroundColor: "rgba(244, 63, 94, 1)",
          pointRadius:     4,
        },
      ],
    },
    options: chartOptions(),
  });
}

/**
 * Grafik Donut — proporsi pemasukan vs pengeluaran.
 */
function renderDoughnutChart(ctx, transactions) {
  const totalIncome = transactions
    .filter((tx) => tx.type === "income")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalExpense = transactions
    .filter((tx) => tx.type === "expense")
    .reduce((sum, tx) => sum + tx.amount, 0);

  if (totalIncome === 0 && totalExpense === 0) {
    document.getElementById("chart-note").textContent = "Belum ada data untuk ditampilkan.";
    return;
  }

  document.getElementById("chart-note").textContent = "Proporsi pemasukan vs pengeluaran";

  financeChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Pemasukan", "Pengeluaran"],
      datasets: [
        {
          data:            [totalIncome, totalExpense],
          backgroundColor: [
            "rgba(34, 197, 94, 0.75)",
            "rgba(244, 63, 94, 0.75)",
          ],
          borderColor: [
            "rgba(34, 197, 94, 1)",
            "rgba(244, 63, 94, 1)",
          ],
          borderWidth: 2,
          hoverOffset: 8,
        },
      ],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      cutout:              "68%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color:     "#8898b0",
            font:      { family: "'Sora', sans-serif", size: 12 },
            padding:   16,
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: "#1a2236",
          titleColor:      "#f0f4ff",
          bodyColor:       "#8898b0",
          borderColor:     "rgba(255,255,255,0.07)",
          borderWidth:     1,
          callbacks: {
            label: (context) => " " + formatCurrency(context.parsed),
          },
        },
      },
    },
  });
}

/**
 * Opsi umum Chart.js untuk grafik Bar & Line.
 * @returns {Object} chartjs options object
 */
function chartOptions() {
  return {
    responsive:          true,
    maintainAspectRatio: false,
    interaction: {
      mode:      "index",
      intersect: false,
    },
    plugins: {
      legend: {
        position: "top",
        labels: {
          color:         "#8898b0",
          font:          { family: "'Sora', sans-serif", size: 12 },
          padding:       16,
          usePointStyle: true,
          pointStyleWidth: 8,
        },
      },
      tooltip: {
        backgroundColor: "#1a2236",
        titleColor:      "#f0f4ff",
        bodyColor:       "#8898b0",
        borderColor:     "rgba(255,255,255,0.07)",
        borderWidth:     1,
        padding:         12,
        callbacks: {
          label: (context) =>
            `  ${context.dataset.label}: ${formatCurrency(context.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color:  "#4e5e75",
          font:   { family: "'Sora', sans-serif", size: 11 },
          maxRotation: 45,
        },
        grid: {
          color: "rgba(255,255,255,0.04)",
        },
      },
      y: {
        ticks: {
          color: "#4e5e75",
          font:  { family: "'Sora', sans-serif", size: 11 },
          callback: (v) => "Rp " + shortNumber(v),
        },
        grid: {
          color: "rgba(255,255,255,0.04)",
        },
        beginAtZero: true,
      },
    },
  };
}

/**
 * Ganti tipe grafik (Bar / Line / Donut).
 * Dipanggil oleh onclick="switchChart(...)" di index.html.
 * @param {string} type - 'bar' | 'line' | 'doughnut'
 */
window.switchChart = function (type) {
  currentChartType = type;

  // Update tab aktif
  document.querySelectorAll(".chart-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.id === `tab-${type}`);
    btn.setAttribute("aria-selected", btn.id === `tab-${type}`);
  });

  // Render ulang dengan tipe baru
  renderChart(filteredTx);
};


// ================================================================
// 11. PILIH TIPE TRANSAKSI (Form Toggle)
// ================================================================
/**
 * Mengatur tombol tipe aktif dan menyimpan nilai ke currentType.
 * Dipanggil oleh onclick="selectType(...)" di index.html.
 * @param {string} type - 'income' | 'expense'
 */
window.selectType = function (type) {
  currentType = type;

  const btnIncome  = document.getElementById("btn-income");
  const btnExpense = document.getElementById("btn-expense");

  btnIncome.classList.toggle("active", type === "income");
  btnExpense.classList.toggle("active", type === "expense");

  btnIncome.setAttribute("aria-pressed",  type === "income");
  btnExpense.setAttribute("aria-pressed", type === "expense");
};


// ================================================================
// 12. HELPER FUNCTIONS
// ================================================================

/**
 * Format angka ke string Rupiah (Rp 1.000.000).
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  return "Rp " + Math.abs(amount).toLocaleString("id-ID");
}

/**
 * Format angka besar menjadi singkatan (1.5jt, 500rb, dll.)
 * untuk label sumbu Y grafik.
 * @param {number} v
 * @returns {string}
 */
function shortNumber(v) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "jt";
  if (v >= 1_000)     return (v / 1_000).toFixed(0) + "rb";
  return String(v);
}

/**
 * Format tanggal "YYYY-MM-DD" ke "DD MMM YYYY" (Bahasa Indonesia).
 * @param {string} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-");
  const months = [
    "Jan","Feb","Mar","Apr","Mei","Jun",
    "Jul","Agu","Sep","Okt","Nov","Des",
  ];
  return `${parseInt(day)} ${months[parseInt(month) - 1]} ${year}`;
}

/**
 * Format tanggal "YYYY-MM-DD" ke "DD/MM" untuk label grafik.
 * @param {string} dateStr
 * @returns {string}
 */
function formatDateShort(dateStr) {
  if (!dateStr) return "-";
  const [, month, day] = dateStr.split("-");
  return `${day}/${month}`;
}

/**
 * Escape karakter HTML untuk mencegah XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return String(str).replace(/[&<>"']/g, (c) => map[c]);
}

/**
 * Tampilkan pesan di bawah form.
 * @param {string} message
 * @param {string} type - 'error' | 'success' | ''
 */
function showFormMessage(message, type) {
  const el = document.getElementById("form-message");
  el.textContent = message;
  el.className   = "form-message " + type;
}

/**
 * Tampilkan toast notification.
 * @param {string} message
 * @param {string} type - 'success' | 'error' | 'info'
 */
function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className   = `toast toast-${type} show`;

  // Sembunyikan otomatis setelah 3 detik
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

/** Sembunyikan loading overlay setelah data pertama kali dimuat. */
function hideLoadingOverlay() {
  document.getElementById("loading-overlay").classList.add("hidden");
}