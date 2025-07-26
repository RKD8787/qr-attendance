// Global Supabase client
let supabaseClient = null;

// Global state
let allStudents = [];
let presentStudents = [];
let filteredStudents = [];

// Initialize Supabase client
function initSupabase() {
    try {
        supabaseClient = supabase.createClient(
            'https://zpesqzstorixfsmpntsx.supabase.co', // 👈 Make sure your URL is correct!
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZXNxenN0b3JpeGZzbXBudHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyOTEzNDYsImV4cCI6MjA2Njg2NzM0Nn0.rm2MEWhfj6re-hRW1xGNEGpwexSNgmce3HpTcrQFPqQ' // 👈 Make sure your Key is correct!
        );
        console.log('✅ Supabase client initialized');
        return true;
    } catch (error) {
        console.error('❌ Supabase initialization error:', error);
        return false;
    }
}

// ✅ MAIN INITIALIZATION
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🔄 DOM Content Loaded');

    if (!initSupabase()) {
        alert('FATAL: Supabase client could not be initialized. Check console.');
        return;
    }

    const currentPage = window.location.pathname;
    await fetchAllStudents(); // Load all students from the database

    if (currentPage.includes('student')) {
        console.log('🎓 Initializing Student View');
        initStudentView();
    } else {
        console.log('👨‍🏫 Initializing Faculty View');
        initFacultyView();
    }
});

// ✅ FETCH ALL STUDENTS FROM SUPABASE
async function fetchAllStudents() {
    if (!supabaseClient) return;
    console.log('🔄 Fetching master student list...');
    try {
        const { data, error } = await supabaseClient
            .from('students')
            .select('name')
            .order('name', { ascending: true });

        if (error) throw error;

        allStudents = data.map(s => s.name);
        filteredStudents = [...allStudents];
        console.log(`✅ Fetched ${allStudents.length} students from the database.`);
    } catch (err) {
        console.error('❌ Error fetching master student list:', err);
        alert('Could not fetch the student list from the database. Please check console and refresh.');
    }
}

// ✅ FACULTY VIEW INITIALIZATION
function initFacultyView() {
    console.log('🔄 Starting faculty view initialization...');
    generateQR();
    fetchAttendance();
    setInterval(generateQR, 30000);
    setInterval(fetchAttendance, 5000);
    updateStudentCount();
    console.log('✅ Faculty view initialized');
}

// ✅ STUDENT VIEW INITIALIZATION
function initStudentView() {
    populateStudentList();
    setupStudentEventListeners();
    setupStudentSearch();
    console.log('✅ Student view initialized');
}

// ✅ QR CODE GENERATION
async function generateQR() {
    const qrCode = document.getElementById('qr-code');
    if (!qrCode) return;
    qrCode.innerHTML = '<p>Generating QR code...</p>';
    if (typeof QRious === 'undefined') {
        qrCode.innerHTML = '<p style="color: red;">QR library not loaded.</p>';
        return;
    }
    const studentUrl = `${window.location.origin}/student.html`;
    qrCode.innerHTML = '';
    const canvas = document.createElement('canvas');
    qrCode.appendChild(canvas);
    new QRious({ element: canvas, value: studentUrl, size: 300 });
    const urlDisplay = document.createElement('p');
    urlDisplay.textContent = `URL: ${studentUrl}`;
    qrCode.appendChild(urlDisplay);
}

// ✅ STUDENT SEARCH
function setupStudentSearch() {
    const searchInput = document.getElementById('student-search');
    if (!searchInput) return;
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        filteredStudents = allStudents.filter(s => s.toLowerCase().includes(searchTerm));
        populateStudentList();
    });
}

// ✅ POPULATE STUDENT LIST (for student page)
function populateStudentList() {
    const studentList = document.getElementById('student-list');
    if (!studentList) return;
    studentList.innerHTML = '';
    if (filteredStudents.length === 0) {
        studentList.innerHTML = `<div class="no-results"><p>No students found.</p></div>`;
        return;
    }
    filteredStudents.forEach((student, index) => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-checkbox';
        studentDiv.innerHTML = `<input type="radio" name="student" id="student-${index}" value="${student}"><label for="student-${index}">${student}</label>`;
        studentDiv.addEventListener('click', () => {
            studentDiv.querySelector('input').checked = true;
            updateStudentSelection();
        });
        studentList.appendChild(studentDiv);
    });
}

// ✅ HANDLE STUDENT SELECTION
function updateStudentSelection() {
    const selectedRadio = document.querySelector('input[name="student"]:checked');
    document.querySelectorAll('.student-checkbox').forEach(div => div.classList.remove('selected'));
    if (selectedRadio) {
        selectedRadio.closest('.student-checkbox').classList.add('selected');
        document.getElementById('submit-attendance').disabled = false;
    }
}

// ✅ SETUP STUDENT EVENT LISTENERS
function setupStudentEventListeners() {
    const submitBtn = document.getElementById('submit-attendance');
    if (submitBtn) submitBtn.addEventListener('click', submitAttendance);
}

// ✅ SUBMIT ATTENDANCE
async function submitAttendance() {
    const selectedRadio = document.querySelector('input[name="student"]:checked');
    if (!selectedRadio) {
        alert("Please select your name first!");
        return;
    }
    const studentName = selectedRadio.value;
    console.log("📝 Submitting attendance for:", studentName);

    const submitBtn = document.getElementById('submit-attendance');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        const { error } = await supabaseClient
            .from('attendance')
            .insert({ student: studentName, timestamp: new Date().toISOString() });

        if (error) {
            if (error.code === '23505') { // Unique constraint violation
                alert("You have already submitted attendance!");
            } else {
                throw error;
            }
        } else {
            console.log("✅ Attendance submitted successfully");
            document.getElementById('student-selection-page').style.display = 'none';
            document.getElementById('success-page').style.display = 'block';
        }
    } catch (err) {
        console.error("❌ Submission error:", err);
        alert("Failed to submit attendance. Please check the console and try again.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Attendance';
    }
}

// ✅ FETCH ATTENDANCE (for faculty)
async function fetchAttendance() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('attendance')
            .select('student, timestamp')
            .order('timestamp', { ascending: false });

        if (error) throw error;
        presentStudents = data.map(record => record.student);
        updatePresentStudentsList();
    } catch (err) {
        console.error("❌ Fetch attendance error:", err);
    }
}

// ✅ UPDATE PRESENT STUDENTS LIST (for faculty)
function updatePresentStudentsList() {
    const listContainer = document.getElementById('present-students-list');
    const countElement = document.getElementById('present-count');
    if (!listContainer || !countElement) return;

    countElement.textContent = presentStudents.length;
    if (presentStudents.length === 0) {
        listContainer.innerHTML = `<div class="student-item" style="opacity: 0.5; font-style: italic;">No students marked present yet</div>`;
        return;
    }
    listContainer.innerHTML = '';
    presentStudents.forEach(student => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-item';
        studentDiv.innerHTML = `<span>${student}</span><button class="remove-btn" onclick="removeStudent('${student}')">Remove</button>`;
        listContainer.appendChild(studentDiv);
    });
}

// ✅ REMOVE STUDENT FROM ATTENDANCE
async function removeStudent(studentName) {
    if (!confirm(`Are you sure you want to remove ${studentName}?`)) return;
    try {
        const { error } = await supabaseClient
            .from('attendance')
            .delete()
            .eq('student', studentName);
        if (error) throw error;
        alert(`${studentName} has been removed.`);
        fetchAttendance();
    } catch (err) {
        console.error("❌ Remove student error:", err);
        alert("Failed to remove student.");
    }
}

// ✅ START FRESH SESSION
async function startFreshAttendance() {
    if (!confirm("⚠️ This will clear all attendance records. Continue?")) return;
    try {
        const { error } = await supabaseClient.from('attendance').delete().neq('student', 'placeholder');
        if (error) throw error;
        alert("✅ All attendance cleared! A fresh session has started.");
        fetchAttendance();
    } catch (err) {
        console.error("❌ Clear attendance error:", err);
        alert("Failed to clear attendance.");
    }
}

// === STUDENT LIST MANAGEMENT (MODAL) === //

function showStudentListModal() {
    document.getElementById('student-list-modal').style.display = 'block';
    populateStudentListDisplay();
}

function closeStudentListModal() {
    document.getElementById('student-list-modal').style.display = 'none';
}

function updateStudentCount() {
    const countElement = document.getElementById('total-student-count');
    if(countElement) countElement.textContent = allStudents.length;
}

function populateStudentListDisplay() {
    const display = document.getElementById('student-list-display');
    if (!display) return;
    display.innerHTML = '';
    allStudents.forEach(student => {
        const item = document.createElement('div');
        item.className = 'student-list-item';
        item.innerHTML = `<span class="student-name">${student}</span><button class="delete-student-btn" onclick="deleteStudent('${student}')">🗑️ Delete</button>`;
        display.appendChild(item);
    });
    updateStudentCount();
}

// ✅ ADD NEW STUDENT TO DATABASE
async function addNewStudent() {
    const input = document.getElementById('new-student-name');
    const studentName = input.value.trim();
    if (!studentName) return alert('Please enter a student name.');
    if (allStudents.find(s => s.toLowerCase() === studentName.toLowerCase())) {
        return alert('Student already exists.');
    }

    try {
        const { error } = await supabaseClient.from('students').insert({ name: studentName });
        if (error) throw error;

        input.value = '';
        alert(`${studentName} added successfully!`);
        await fetchAllStudents(); // Refresh the list
        populateStudentListDisplay(); // Update modal view
    } catch(err) {
        console.error('❌ Error adding new student:', err);
        alert('Failed to add new student.');
    }
}

// ✅ DELETE STUDENT FROM DATABASE
async function deleteStudent(studentName) {
    if (!confirm(`This will permanently delete ${studentName} from the master list. Continue?`)) return;
    try {
        const { error } = await supabaseClient.from('students').delete().eq('name', studentName);
        if (error) throw error;
        await removeStudent(studentName); // Also remove from attendance if present
        alert(`${studentName} deleted successfully!`);
        await fetchAllStudents(); // Refresh the list
        populateStudentListDisplay(); // Update modal view
    } catch(err) {
        console.error('❌ Error deleting student:', err);
        alert('Failed to delete student.');
    }
}

// === MANUAL ATTENDANCE (MODAL) === //

function showAddManuallyModal() {
    document.getElementById('add-manually-modal').style.display = 'block';
    populateFacultyStudentDropdown();
}

function closeAddManuallyModal() {
    document.getElementById('add-manually-modal').style.display = 'none';
}

function populateFacultyStudentDropdown() {
    const dropdown = document.getElementById('student-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = '';
    const unpresentStudents = allStudents.filter(s => !presentStudents.includes(s));
    
    unpresentStudents.forEach(student => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.textContent = student;
        item.onclick = () => addStudentManually(student);
        dropdown.appendChild(item);
    });
}

async function addStudentManually(studentName) {
    if (!studentName) return;
    if (presentStudents.includes(studentName)) {
        return alert('Student is already marked present!');
    }
    try {
        const { error } = await supabaseClient.from('attendance').insert({ student: studentName });
        if (error) throw error;
        alert(`${studentName} added successfully!`);
        fetchAttendance();
        closeAddManuallyModal();
    } catch(err) {
        console.error('❌ Add manually error:', err);
        alert('Failed to add student manually.');
    }
}

// === UTILITY === //

function logout() {
    localStorage.clear();
    window.location.href = 'login.html';
}
