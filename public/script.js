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
            'https://zpesqzstorixfsmpntsx.supabase.co', // Your Supabase URL
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZXNxenN0b3JpeGZzbXBudHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyOTEzNDYsImV4cCI6MjA2Njg2NzM0Nn0.rm2MEWhfj6re-hRW1xGNEGpwexSNgmce3HpTcrQFPqQ' // Your Supabase Key
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
        alert('FATAL: Supabase client could not be initialized.');
        return;
    }
    const currentPage = window.location.pathname;
    await fetchAllStudents();
    if (currentPage.includes('student')) {
        initStudentView();
    } else {
        initFacultyView();
    }
});

// ✅ FETCH ALL STUDENTS FROM SUPABASE
async function fetchAllStudents() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient.from('students').select('name').order('name', { ascending: true });
        if (error) throw error;
        allStudents = data.map(s => s.name);
        filteredStudents = [...allStudents];
        console.log('✅ Fetched students:', allStudents.length);
    } catch (err) {
        console.error('❌ Error fetching master student list:', err);
    }
}

// ✅ FETCH ATTENDANCE FROM SUPABASE
async function fetchAttendance() {
    if (!supabaseClient) return;
    try {
        const sessionId = localStorage.getItem('sessionId');
        if (!sessionId) {
            console.log('No session ID found');
            return;
        }

        const { data, error } = await supabaseClient
            .from('attendance')
            .select('student, timestamp')
            .eq('session_id', sessionId)
            .order('timestamp', { ascending: false });

        if (error) throw error;

        presentStudents = data.map(record => record.student);
        updatePresentStudentsList(data);
        updatePresentCount();
        
        console.log('✅ Fetched attendance:', presentStudents.length, 'students present');
    } catch (err) {
        console.error('❌ Error fetching attendance:', err);
    }
}

// ✅ UPDATE PRESENT STUDENTS LIST IN UI
function updatePresentStudentsList(attendanceData) {
    const listElement = document.getElementById('present-students-list');
    if (!listElement) return;

    if (attendanceData.length === 0) {
        listElement.innerHTML = '<div class="student-item" style="opacity: 0.5; font-style: italic;">No students marked present yet</div>';
        return;
    }

    listElement.innerHTML = '';
    attendanceData.forEach(record => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-item';
        studentDiv.innerHTML = `
            <span>${record.student}</span>
            <button class="remove-btn" onclick="removeStudent('${record.student}')">Remove</button>
        `;
        listElement.appendChild(studentDiv);
    });
}

// ✅ UPDATE PRESENT COUNT
function updatePresentCount() {
    const countElement = document.getElementById('present-count');
    if (countElement) {
        countElement.textContent = presentStudents.length;
    }
}

// ✅ REMOVE STUDENT FROM ATTENDANCE
async function removeStudent(studentName) {
    if (!confirm(`Remove ${studentName} from attendance?`)) return;
    
    try {
        const sessionId = localStorage.getItem('sessionId');
        const { error } = await supabaseClient
            .from('attendance')
            .delete()
            .eq('student', studentName)
            .eq('session_id', sessionId);

        if (error) throw error;
        
        console.log('✅ Student removed:', studentName);
        fetchAttendance(); // Refresh the list
    } catch (err) {
        console.error('❌ Error removing student:', err);
        alert('Failed to remove student.');
    }
}

// ✅ FACULTY VIEW INITIALIZATION
function initFacultyView() {
    // Ensure a session ID exists on first load
    if (!localStorage.getItem('sessionId')) {
        localStorage.setItem('sessionId', Date.now().toString());
    }
    console.log('🔄 Starting faculty view initialization...');
    generateQR();
    fetchAttendance();
    setInterval(fetchAttendance, 5000);
    updateStudentCount();
}

// ✅ STUDENT VIEW INITIALIZATION
function initStudentView() {
    populateStudentList();
    setupStudentEventListeners();
    setupStudentSearch();
}

// ✅ POPULATE STUDENT LIST FOR STUDENT VIEW
function populateStudentList() {
    const studentList = document.getElementById('student-list');
    if (!studentList) return;

    studentList.innerHTML = '';

    if (filteredStudents.length === 0) {
        studentList.innerHTML = '<div class="no-results"><p>No students found</p></div>';
        return;
    }

    filteredStudents.forEach(student => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-checkbox';
        studentDiv.innerHTML = `
            <input type="radio" name="student" value="${student}" id="student-${student}">
            <label for="student-${student}">${student}</label>
        `;
        studentList.appendChild(studentDiv);
    });

    // Add event listeners to radio buttons
    const radioButtons = studentList.querySelectorAll('input[type="radio"]');
    radioButtons.forEach(radio => {
        radio.addEventListener('change', updateStudentSelection);
    });
}

// ✅ HANDLE STUDENT SELECTION
function updateStudentSelection() {
    const submitBtn = document.getElementById('submit-attendance');
    const selectedRadio = document.querySelector('input[name="student"]:checked');
    
    if (submitBtn) {
        submitBtn.disabled = !selectedRadio;
    }

    // Update visual selection
    const checkboxes = document.querySelectorAll('.student-checkbox');
    checkboxes.forEach(checkbox => {
        const radio = checkbox.querySelector('input[type="radio"]');
        if (radio && radio.checked) {
            checkbox.classList.add('selected');
        } else {
            checkbox.classList.remove('selected');
        }
    });
}

// ✅ SETUP STUDENT EVENT LISTENERS
function setupStudentEventListeners() {
    const submitBtn = document.getElementById('submit-attendance');
    const closeBtn = document.getElementById('close-success');
    
    if (submitBtn) {
        submitBtn.addEventListener('click', submitAttendance);
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            window.close();
        });
    }
}

// ✅ QR CODE GENERATION (WITH SESSION ID)
async function generateQR() {
    const qrCodeContainer = document.getElementById('qr-code');
    if (!qrCodeContainer) {
        console.error("QR container not found!");
        return;
    }

    // Clear previous content and show a loading message
    qrCodeContainer.innerHTML = '<p>Generating QR code...</p>';

    const sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
        qrCodeContainer.innerHTML = '<p style="color: red;">No active session. Please click "Start Fresh Session".</p>';
        return;
    }

    if (typeof QRious === 'undefined') {
        qrCodeContainer.innerHTML = '<p style="color: red;">QR library is not loaded. Please refresh.</p>';
        return;
    }

    const studentUrl = `${window.location.origin}/student.html?session=${sessionId}`;

    // THE FIX: Create a <canvas> element for QRious to draw on
    qrCodeContainer.innerHTML = ''; // Clear the "Generating..." message
    const canvas = document.createElement('canvas');
    qrCodeContainer.appendChild(canvas);

    new QRious({
        element: canvas, // Give the library the <canvas> element
        value: studentUrl,
        size: 300,
        padding: 20
    });

    console.log('✅ QR code generated for session:', sessionId);
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

// ✅ REVISED: Export attendance CSV with a more reliable download method
async function exportAttendanceCSV() {
    console.log('📤 Export process started...');

    if (!supabaseClient) {
        alert("Database connection not available. Please refresh the page.");
        return;
    }

    try {
        console.log('🔄 Fetching data from Supabase for export...');
        const { data, error } = await supabaseClient
            .from('attendance')
            .select('student, timestamp')
            .order('timestamp', { ascending: false });

        if (error) {
            console.error("❌ Export fetch error:", error);
            alert("Failed to fetch attendance data for export. Check the console for details.");
            return;
        }

        if (data.length === 0) {
            alert("No attendance data to export.");
            return;
        }
        console.log(`✅ Found ${data.length} records to export.`);

        // Create CSV content
        const csvRows = ['"Name","Timestamp"']; // Header row
        data.forEach(record => {
            const timestamp = new Date(record.timestamp).toLocaleString('en-US');
            csvRows.push(`"${record.student}","${timestamp}"`);
        });

        // Create a Blob for the CSV data
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        // --- THE FIX ---
        // Create a temporary link element to trigger the download
        const a = document.createElement('a');
        a.style.display = 'none'; // Keep the link hidden
        a.href = url;
        a.download = `attendance_${new Date().toISOString().split('T')[0]}.csv`;
        
        // Append the link to the body, click it, and then remove it
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // --- END OF FIX ---

        // Clean up the object URL to free up memory
        URL.revokeObjectURL(url);
        
        console.log('✅ Attendance exported successfully!');
        // Provide clear feedback to the user
        alert('Attendance has been exported! Check your downloads folder.');

    } catch (err) {
        console.error('❌ A critical error occurred during export:', err);
        alert('Failed to export attendance. Please check the console for critical errors.');
    }
}

// ✅ SUBMIT ATTENDANCE (WITH SESSION VALIDATION)
async function submitAttendance() {
    const selectedRadio = document.querySelector('input[name="student"]:checked');
    if (!selectedRadio) {
        alert("Please select your name first!");
        return;
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    const currentSessionId = urlParams.get('session');
    
    if (!currentSessionId) {
        alert("Invalid or missing session. Please scan the QR code again.");
        return;
    }

    const submittedSessions = JSON.parse(localStorage.getItem('submittedSessions') || '[]');
    if (submittedSessions.includes(currentSessionId)) {
        alert("You have already submitted attendance for this session from this device.");
        return;
    }

    const studentName = selectedRadio.value;
    const submitBtn = document.getElementById('submit-attendance');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        const { error } = await supabaseClient
            .from('attendance')
            .insert({ 
                student: studentName, 
                session_id: currentSessionId,
                timestamp: new Date().toISOString()
            });

        if (error) {
            if (error.code === '23505') {
                alert("Attendance for this session has already been recorded for you.");
            } else {
                throw error;
            }
        } else {
            submittedSessions.push(currentSessionId);
            localStorage.setItem('submittedSessions', JSON.stringify(submittedSessions));
            document.getElementById('student-selection-page').style.display = 'none';
            document.getElementById('success-page').style.display = 'block';
        }
    } catch (err) {
        console.error("❌ Submission error:", err);
        alert("Failed to submit attendance: " + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Attendance';
    }
}

// ✅ START FRESH SESSION (RE-GENERATES QR)
// ✅ START FRESH SESSION (RE-GENERATES QR) - FIXED VERSION
async function startFreshAttendance() {
    if (!confirm("⚠️ This will clear ALL attendance records and start a new session. Continue?")) return;
    
    try {
        // Option 1: Delete all attendance records using a column that exists
        // Replace 'student' with any column that exists in your attendance table
        const { error } = await supabaseClient
            .from('attendance')
            .delete()
            .neq('student', ''); // This will match all records since student names are never empty
        
        // Alternative Option 2: If the above doesn't work, you can try:
        // const { error } = await supabaseClient
        //     .from('attendance')
        //     .delete()
        //     .not('student', 'is', null);
        
        // Alternative Option 3: If you know your table structure, you can use:
        // const { error } = await supabaseClient
        //     .from('attendance')
        //     .delete()
        //     .gte('timestamp', '1900-01-01'); // Deletes all records with timestamp after 1900
        
        if (error) throw error;
        
        const newSessionId = Date.now().toString();
        localStorage.setItem('sessionId', newSessionId);
        
        // Clear present students array
        presentStudents = [];
        
        // Immediately regenerate the QR code with the new session
        await generateQR();
        
        // Update UI
        updatePresentCount();
        updatePresentStudentsList([]);
        
        alert("✅ All attendance cleared! A new session has started.");
        console.log('✅ Fresh session started:', newSessionId);
        
    } catch (err) {
        console.error("❌ Clear attendance error:", err);
        alert("Failed to clear attendance: " + err.message);
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
    
    if (allStudents.length === 0) {
        display.innerHTML = '<div class="no-students-message">No students in the list</div>';
        return;
    }
    
    allStudents.forEach(student => {
        const item = document.createElement('div');
        item.className = 'student-list-item';
        item.innerHTML = `
            <span class="student-name">${student}</span>
            <button class="delete-student-btn" onclick="deleteStudent('${student}')">
                🗑️ Delete
            </button>
        `;
        display.appendChild(item);
    });
    updateStudentCount();
}

// ✅ ADD NEW STUDENT TO DATABASE
async function addNewStudent() {
    const input = document.getElementById('new-student-name');
    const studentName = input.value.trim();
    
    if (!studentName) {
        alert('Please enter a student name.');
        return;
    }
    
    if (allStudents.find(s => s.toLowerCase() === studentName.toLowerCase())) {
        alert('Student already exists.');
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('students')
            .insert({ name: studentName });
            
        if (error) throw error;

        input.value = '';
        alert(`${studentName} added successfully!`);
        await fetchAllStudents(); // Refresh the list
        populateStudentListDisplay(); // Update modal view
        
    } catch(err) {
        console.error('❌ Error adding new student:', err);
        alert('Failed to add new student: ' + err.message);
    }
}

// ✅ DELETE STUDENT FROM DATABASE
async function deleteStudent(studentName) {
    if (!confirm(`This will permanently delete ${studentName} from the master list. Continue?`)) return;
    
    try {
        const { error } = await supabaseClient
            .from('students')
            .delete()
            .eq('name', studentName);
            
        if (error) throw error;
        
        // Also remove from attendance if present
        await removeStudent(studentName);
        
        alert(`${studentName} deleted successfully!`);
        await fetchAllStudents(); // Refresh the list
        populateStudentListDisplay(); // Update modal view
        
    } catch(err) {
        console.error('❌ Error deleting student:', err);
        alert('Failed to delete student: ' + err.message);
    }
}

// === MANUAL ATTENDANCE (MODAL) === //

function showAddManuallyModal() {
    document.getElementById('add-manually-modal').style.display = 'block';
    populateFacultyStudentDropdown();
    setupFacultyStudentSearch();
}

function closeAddManuallyModal() {
    document.getElementById('add-manually-modal').style.display = 'none';
}

function setupFacultyStudentSearch() {
    const searchInput = document.getElementById('student-search');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        populateFacultyStudentDropdown(searchTerm);
    });
}

function populateFacultyStudentDropdown(searchTerm = '') {
    const dropdown = document.getElementById('student-dropdown');
    if (!dropdown) return;
    
    dropdown.innerHTML = '';
    
    // Filter students who are not present and match search term
    const unpresentStudents = allStudents.filter(s => 
        !presentStudents.includes(s) && 
        s.toLowerCase().includes(searchTerm)
    );
    
    if (unpresentStudents.length === 0) {
        const noResults = document.createElement('div');
        noResults.className = 'dropdown-item no-results';
        noResults.textContent = searchTerm ? 'No matching students found' : 'All students are already present';
        dropdown.appendChild(noResults);
        return;
    }
    
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
        alert('Student is already marked present!');
        return;
    }
    
    try {
        const sessionId = localStorage.getItem('sessionId');
        if (!sessionId) {
            alert('No active session. Please start a fresh session first.');
            return;
        }
        
        const { error } = await supabaseClient
            .from('attendance')
            .insert({ 
                student: studentName, 
                session_id: sessionId,
                timestamp: new Date().toISOString()
            });
            
        if (error) throw error;
        
        alert(`${studentName} added successfully!`);
        fetchAttendance();
        closeAddManuallyModal();
        
    } catch(err) {
        console.error('❌ Add manually error:', err);
        alert('Failed to add student manually: ' + err.message);
    }
}

// === UTILITY === //

function logout() {
    localStorage.clear();
    window.location.href = 'login.html';
}

// Page navigation function (if needed)
function showPage(pageId) {
    // Hide all pages
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));
    
    // Show selected page
    const selectedPage = document.getElementById(pageId + '-page');
    if (selectedPage) {
        selectedPage.classList.add('active');
    }
    
    // Update nav buttons
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => btn.classList.remove('active'));
    
    const activeBtn = document.querySelector(`[onclick="showPage('${pageId}')"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}
