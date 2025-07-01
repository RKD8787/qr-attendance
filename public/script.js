let sessionId = null;

// ✅ FIXED: Proper session check with localStorage clearing
// ✅ SIMPLIFIED: Generate session ID locally
function generateSessionId() {
    const existingSession = localStorage.getItem('sessionId');
    if (!existingSession) {
        const newSession = Date.now().toString();
        localStorage.setItem('sessionId', newSession);
        return newSession;
    }
    return existingSession;
}

// ✅ SIMPLIFIED: Check if it's a new session (for clearing attendance)
function isNewSession() {
    const currentTime = Date.now();
    const lastSessionTime = localStorage.getItem('lastSessionTime') || '0';
    const timeDiff = currentTime - parseInt(lastSessionTime);
    
    // Consider it a new session if more than 1 hour has passed
    if (timeDiff > 3600000) { // 1 hour in milliseconds
        localStorage.setItem('lastSessionTime', currentTime.toString());
        localStorage.removeItem('attendanceSubmitted');
        return true;
    }
    return false;
}

// Student data - This will be loaded from localStorage if available
let allStudents = [
    'Raushan Sharma', 'Qareena sadaf', 'Rohit Rathod', 'deval Gupta', 
    'Indrajeet','Arijit Singh', 'Balaji', 'Rajesh Yadav', 'Kavya Nair',
    'Aditya Joshi', 'Riya Malhotra', 'Sanjay Thakur', 'Arjun Reddy',
    'Harsh Agarwal', 'Megha Kapoor', 'Nikhil Sharma','Nand Kumar', 'Shreya Ghosal'
];

let presentStudents = [];
let selectedStudents = [];
let filteredStudents = [...allStudents];

// ✅ MAIN INITIALIZATION - Only one entry point
document.addEventListener('DOMContentLoaded', function() {
    const currentPage = window.location.pathname;
    
    if (currentPage.includes('student.html')) {
        console.log('🎓 Initializing Student View');
        initStudentView();
    } else {
        console.log('👨‍🏫 Initializing Faculty View');
        initFacultyView();
    }
});

// ✅ FACULTY VIEW INITIALIZATION
function initFacultyView() {
    loadStudentList(); // Load saved student list
    generateQR();
    setInterval(generateQR, 30000); // Refresh QR every 30 sec
    fetchAttendance();
    
    // Auto-refresh attendance every 5 seconds
    setInterval(fetchAttendance, 5000);
    
    console.log('✅ Faculty view initialized');
}

// ✅ FIXED QR CODE GENERATION - Now uses network IP with larger size
// ✅ FIXED: Generate QR code without network API call
 async function generateQR() {
    console.log('🔄 Generating QR code...');

    const qrCode = document.getElementById('qr-code');
    if (!qrCode) {
        console.error("❌ QR container not found");
        return;
    }

    qrCode.innerHTML = '<p>Generating QR code...</p>';

    try {
        // ✅ Use current domain for student URL
        const currentDomain = window.location.origin;
        const studentUrl = `${currentDomain}/student.html`;

        qrCode.innerHTML = '';

        const canvas = document.createElement('canvas');
        qrCode.appendChild(canvas);

        new QRious({
            element: canvas,
            value: studentUrl,
            size: 300,
            background: 'white',
            foreground: 'black',
            level: 'M'
        });

        console.log('✅ QR code generated for:', studentUrl);

        const urlDisplay = document.createElement('p');
        urlDisplay.style.marginTop = '15px';
        urlDisplay.style.fontSize = '14px';
        urlDisplay.style.color = '#666';
        urlDisplay.style.wordBreak = 'break-all';
        urlDisplay.textContent = `URL: ${studentUrl}`;
        qrCode.appendChild(urlDisplay);

    } catch (error) {
        console.error('❌ QR Code generation failed:', error);
        qrCode.innerHTML = '<p style="color: red;">QR Code generation failed. Please check console.</p>';
    }
}

// ✅ STUDENT VIEW INITIALIZATION - Fixed session handling
// ✅ SIMPLIFIED: Student view initialization
async function initStudentView() {
    // Check if it's a new session and clear submission flag if needed
    isNewSession();
    
    loadStudentList();
    populateStudentList();
    setupStudentEventListeners();
    setupStudentSearch();
    
    // Show selection page, hide success page
    const selectionPage = document.getElementById('student-selection-page');
    const successPage = document.getElementById('success-page');
    
    if (selectionPage) selectionPage.style.display = 'block';
    if (successPage) {
        successPage.style.display = 'none';
        successPage.classList.add('hidden');
    }
    
    console.log('✅ Student view initialized');
}
// ✅ NEW: Setup student search functionality
function setupStudentSearch() {
    const searchInput = document.getElementById('student-search');
    if (!searchInput) return;

    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        if (searchTerm === '') {
            filteredStudents = [...allStudents];
        } else {
            filteredStudents = allStudents.filter(student => 
                student.toLowerCase().includes(searchTerm)
            );
        }
        
        populateStudentList();
    });

    // Clear search on Escape key
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            e.target.value = '';
            filteredStudents = [...allStudents];
            populateStudentList();
        }
    });
}

// ✅ POPULATE STUDENT LIST WITH RADIO BUTTONS - Updated for search
function populateStudentList() {
    const studentList = document.getElementById('student-list');
    if (!studentList) {
        console.error('❌ Student list container not found');
        return;
    }

    studentList.innerHTML = '';

    if (filteredStudents.length === 0) {
        studentList.innerHTML = `
            <div class="no-results">
                <p>No students found matching your search.</p>
            </div>
        `;
        return;
    }

    filteredStudents.forEach((student, index) => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-checkbox';

        studentDiv.innerHTML = `
            <input type="radio" name="student" id="student-${index}" value="${student}">
            <label for="student-${index}">${student}</label>
        `;

        // Add click listener for the entire div
        studentDiv.addEventListener('click', function(e) {
            if (e.target.tagName !== 'INPUT') {
                const radio = studentDiv.querySelector('input');
                radio.checked = true;
                updateStudentSelection();
            }
        });

        // Add change listener for radio button
        const radio = studentDiv.querySelector('input');
        radio.addEventListener('change', updateStudentSelection);

        studentList.appendChild(studentDiv);
    });
}

// ✅ UPDATE STUDENT SELECTION
function updateStudentSelection() {
    const selectedRadio = document.querySelector('input[name="student"]:checked');
    const submitBtn = document.getElementById('submit-attendance');
    
    // Remove previous selection styling
    document.querySelectorAll('.student-checkbox').forEach(div => {
        div.classList.remove('selected');
    });
    
    if (selectedRadio) {
        selectedStudents = [selectedRadio.value];
        selectedRadio.closest('.student-checkbox').classList.add('selected');
        if (submitBtn) submitBtn.disabled = false;
    } else {
        selectedStudents = [];
        if (submitBtn) submitBtn.disabled = true;
    }
}

// ✅ SETUP STUDENT EVENT LISTENERS
function setupStudentEventListeners() {
    const submitBtn = document.getElementById('submit-attendance');
    const closeSuccessBtn = document.getElementById('close-success');
    
    if (submitBtn) {
        submitBtn.addEventListener('click', submitAttendance);
    }
    
    if (closeSuccessBtn) {
        closeSuccessBtn.addEventListener('click', function() {
            // Reset and show selection page again
            resetStudentSelection();
            document.getElementById('success-page').style.display = 'none'; // ✅ FIXED
            document.getElementById('success-page').classList.add('hidden');
            document.getElementById('student-selection-page').style.display = 'block';
        });
    }
}

// ✅ FIXED: Submit attendance with proper session checking and success page display
// ✅ FIXED: Submit attendance with Supabase
async function submitAttendance() {
    if (localStorage.getItem('attendanceSubmitted') === 'true') {
        alert("Attendance already submitted from this device!");
        return;
    }

    if (selectedStudents.length === 0) {
        alert("Please select your name first!");
        return;
    }

    const student = selectedStudents[0];
    console.log("📝 Submitting attendance for:", student);

    const submitBtn = document.getElementById('submit-attendance');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
    }

    try {
        // ✅ Insert into Supabase
        const { data, error } = await supabase
            .from('attendance')
            .insert([
                { 
                    student: student,
                    timestamp: new Date().toISOString()
                }
            ]);

        if (error) {
            console.error("Supabase insert error:", error);
            if (error.code === '23505') { // Unique constraint violation
                alert("You have already submitted attendance!");
                return;
            }
            throw error;
        }

        console.log("✅ Attendance submitted successfully");
        
        // Save submission status in localStorage
        localStorage.setItem('attendanceSubmitted', 'true');
        
        // Show success page
        showSuccessPage();

    } catch (err) {
        console.error("❌ Submission error:", err);
        alert("Failed to submit attendance. Please try again.");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Attendance';
        }
    }
}

// ✅ FIXED: Start fresh attendance with proper session handling
// ✅ FIXED: Start fresh attendance
async function startFreshAttendance() {
    if (!confirm("⚠️ This will clear all attendance and allow fresh submissions. Continue?")) return;

    try {
        const { error } = await supabase
            .from('attendance')
            .delete()
            .neq('student', ''); // Delete all records

        if (error) {
            console.error("Failed to clear attendance:", error);
            alert("Failed to clear attendance. Please try again.");
        } else {
            // Clear local storage flags
            localStorage.removeItem('attendanceSubmitted');
            localStorage.setItem('sessionId', Date.now().toString());
            localStorage.setItem('lastSessionTime', Date.now().toString());
            
            alert("✅ All attendance cleared! Fresh session started.");
            fetchAttendance(); // Refresh the display
        }
    } catch (err) {
        console.error("❌ Clear attendance error:", err);
        alert("Failed to clear attendance. Please try again.");
    }
}

// ✅ FIXED: Show success page with proper display handling
function showSuccessPage() {
    console.log('🎉 Showing success page...');
    
    const selectionPage = document.getElementById('student-selection-page');
    const successPage = document.getElementById('success-page');
    
    if (selectionPage) {
        selectionPage.style.display = 'none';
    }
    
    if (successPage) {
        successPage.style.display = 'block'; // ✅ FIXED: Use display block
        successPage.classList.remove('hidden');
    }
    
    console.log('✅ Success page displayed');
}

// ✅ RESET STUDENT SELECTION
function resetStudentSelection() {
    selectedStudents = [];
    document.querySelectorAll('input[name="student"]').forEach(radio => {
        radio.checked = false;
    });
    document.querySelectorAll('.student-checkbox').forEach(div => {
        div.classList.remove('selected');
    });
    
    const submitBtn = document.getElementById('submit-attendance');
    if (submitBtn) submitBtn.disabled = true;
    
    // Clear search
    const searchInput = document.getElementById('student-search');
    if (searchInput) searchInput.value = '';
    filteredStudents = [...allStudents];
}

// ✅ FIXED: Fetch attendance - Handle new response structure
async function fetchAttendance() {
    try {
        const { data, error } = await supabase
            .from('attendance')
            .select('student, timestamp')
            .order('timestamp', { ascending: false });

        if (error) {
            console.error("❌ Failed to fetch attendance:", error);
            return;
        }
        presentStudents = data.map(record => record.student);
        
        updatePresentStudentsList();
        updatePresentCount();
        
        console.log(`✅ Fetched ${presentStudents.length} present students`);

    } catch (err) {
        console.error("❌ Fetch attendance error:", err);
    }
} 

// ✅ UPDATE PRESENT STUDENTS LIST (Faculty View)
function updatePresentStudentsList() {
    const listContainer = document.getElementById('present-students-list');
    if (!listContainer) return;
    
    if (presentStudents.length === 0) {
        listContainer.innerHTML = `
            <div class="student-item" style="opacity: 0.5; font-style: italic;">
                No students marked present yet
            </div>
        `;
        return;
    }
    
    listContainer.innerHTML = '';
    presentStudents.forEach((student, index) => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'student-item';
        studentDiv.innerHTML = `
            <span>${student}</span>
            <button class="remove-btn" onclick="removeStudent('${student}')">Remove</button>
        `;
        listContainer.appendChild(studentDiv);
    });
}

// ✅ UPDATE PRESENT COUNT (Faculty View)
function updatePresentCount() {
    const countElement = document.getElementById('present-count');
    if (countElement) {
        countElement.textContent = presentStudents.length;
    }
}

// ✅ REMOVE STUDENT (Faculty View)
function removeStudent(student) {
    // ✅ FIXED: Remove student using Supabase
function removeStudent(student) {
    if (!confirm(`Are you sure you want to remove ${student} from attendance?`)) return;

    supabase
        .from('attendance')
        .delete()
        .eq('student', student)
        .then(({ error }) => {
            if (error) {
                console.error("❌ Remove error:", error);
                alert("Failed to remove student from attendance.");
            } else {
                alert(`${student} has been removed.`);
                fetchAttendance(); // Refresh list
            }
        });
}

// ✅ FIXED: Export attendance CSV
function exportAttendanceCSV() {
    fetch('/api/attendance')
        .then(res => res.json())
        .then(response => {
            const data = response.attendanceData || {};
            const csvRows = ['Name,Timestamp'];
            for (const student in data) {
                csvRows.push(`"${student}","${data[student]}"`);
            }

            const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `attendance_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();

            URL.revokeObjectURL(url);
            console.log('📤 Attendance exported');
        })
        .catch(err => {
            console.error('❌ Export error:', err);
            alert('Failed to export attendance');
        });
}

// ✅ FIXED: Faculty Add Student Manually Modal Functions
let facultyFilteredStudents = [...allStudents];

function showAddManuallyModal() {
    // ✅ FIX: Always sync with current student list
    facultyFilteredStudents = [...allStudents];
    
    document.getElementById('add-manually-modal').style.display = 'block';
    populateFacultyStudentDropdown();
    
    // Focus on search input
    const searchInput = document.getElementById('student-search');
    if (searchInput) {
        searchInput.focus();
        searchInput.value = '';
    }
}

function closeAddManuallyModal() {
    document.getElementById('add-manually-modal').style.display = 'none';
    const searchInput = document.getElementById('student-search');
    if (searchInput) searchInput.value = '';
    
    // ✅ FIX: Reset to current student list
    facultyFilteredStudents = [...allStudents];
}

// ✅ NEW: Populate faculty student dropdown with search
function populateFacultyStudentDropdown() {
    const dropdown = document.getElementById('student-dropdown');
    if (!dropdown) return;

    dropdown.innerHTML = '';

    if (facultyFilteredStudents.length === 0) {
        dropdown.innerHTML = `
            <div class="dropdown-item no-results">
                No students found matching your search
            </div>
        `;
        return;
    }

    facultyFilteredStudents.forEach(student => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.textContent = student;
        
        // Check if student is already present
        if (presentStudents.includes(student)) {
            item.style.opacity = '0.5';
            item.style.color = '#999';
            item.innerHTML = `${student} <small>(Already Present)</small>`;
            item.style.cursor = 'not-allowed';
        } else {
            item.onclick = () => addStudentManually(student);
        }
        
        dropdown.appendChild(item);
    });
}

// ✅ FIXED: Add student manually function
function addStudentManually(studentName) {
    if (!studentName) return;

    // Check if student is already present
    if (presentStudents.includes(studentName)) {
        alert('Student is already marked present!');
        return;
    }

    fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student: studentName })
    })
    .then(res => res.json().then(data => ({ status: res.status, data })))
    .then(({ status, data }) => {
        if (status === 409) {
            alert('Student is already marked present!');
        } else if (status === 200) {
            alert(`${studentName} added successfully!`);
            fetchAttendance(); // Refresh the list
            closeAddManuallyModal();
        } else {
            throw new Error('Failed to add student');
        }
    })
    .catch(err => {
        console.error('❌ Add manually error:', err);
        alert('Failed to add student');
    });
}

// ✅ STUDENT LIST MANAGEMENT FUNCTIONS

function showStudentListModal() {
    document.getElementById('student-list-modal').style.display = 'block';
    populateStudentListDisplay();
    updateStudentCount();
    
    // Clear search input
    const searchInput = document.getElementById('student-list-search');
    if (searchInput) searchInput.value = '';
}

function closeStudentListModal() {
    document.getElementById('student-list-modal').style.display = 'none';
    
    // Clear add student input
    const addInput = document.getElementById('new-student-name');
    if (addInput) addInput.value = '';
    
    // Clear search input
    const searchInput = document.getElementById('student-list-search');
    if (searchInput) searchInput.value = '';
}

function addNewStudent() {
    const input = document.getElementById('new-student-name');
    const studentName = input.value.trim();
    
    if (!studentName) {
        alert('Please enter a student name');
        return;
    }
    
    if (allStudents.includes(studentName)) {
        alert('Student already exists in the list');
        input.value = '';
        return;
    }
    
    // Add to allStudents array
    allStudents.push(studentName);
    allStudents.sort(); // Keep list sorted
    
    // ✅ FIX: Update filtered list for student view
    filteredStudents = [...allStudents];
    
    // ✅ FIX: Update faculty filtered list
    facultyFilteredStudents = [...allStudents];
    
    // Clear input
    input.value = '';
    
    // Refresh display
    populateStudentListDisplay();
    updateStudentCount();
    
    // ✅ FIX: Update student view if on student page
    if (typeof populateStudentList === 'function') {
        populateStudentList();
    }
    
    // Save to localStorage for persistence
    localStorage.setItem('studentList', JSON.stringify(allStudents));
    
    alert(`${studentName} added successfully!`);
}


function deleteStudent(studentName) {
    if (!confirm(`Are you sure you want to delete ${studentName} from the student list?`)) {
        return;
    }
    
    // Remove from allStudents array
    const index = allStudents.indexOf(studentName);
    if (index > -1) {
        allStudents.splice(index, 1);
    }
    
    // ✅ FIX: Update filtered list for student view
    filteredStudents = [...allStudents];
    
    // ✅ FIX: Update faculty filtered list
    facultyFilteredStudents = [...allStudents];
    
    // Remove from attendance if present
    if (presentStudents.includes(studentName)) {
        removeStudent(studentName);
    }
    
    // Refresh display
    populateStudentListDisplay();
    updateStudentCount();
    
    // ✅ FIX: Update student view if on student page
    if (typeof populateStudentList === 'function') {
        populateStudentList();
    }
    
    // Save to localStorage for persistence
    localStorage.setItem('studentList', JSON.stringify(allStudents));
    
    alert(`${studentName} deleted successfully!`);
}

function populateStudentListDisplay() {
    const display = document.getElementById('student-list-display');
    if (!display) return;
    
    const searchTerm = document.getElementById('student-list-search')?.value.toLowerCase().trim() || '';
    
    let studentsToShow = allStudents;
    if (searchTerm) {
        studentsToShow = allStudents.filter(student => 
            student.toLowerCase().includes(searchTerm)
        );
    }
    
    display.innerHTML = '';
    
    if (studentsToShow.length === 0) {
        display.innerHTML = `
            <div class="no-students-message">
                ${searchTerm ? 'No students found matching your search' : 'No students in the list'}
            </div>
        `;
        return;
    }
    
    studentsToShow.forEach(student => {
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
}

function updateStudentCount() {
    const countElement = document.getElementById('total-student-count');
    if (countElement) {
        countElement.textContent = allStudents.length;
    }
}

// ✅ LOAD STUDENT LIST FROM LOCALSTORAGE ON INIT
function loadStudentList() {
    const savedList = localStorage.getItem('studentList');
    if (savedList) {
        try {
            const parsedList = JSON.parse(savedList);
            if (Array.isArray(parsedList) && parsedList.length > 0) {
                allStudents.length = 0; // Clear existing array
                allStudents.push(...parsedList.sort()); // Add saved students
                filteredStudents = [...allStudents];
                console.log('✅ Student list loaded from localStorage:', allStudents.length, 'students');
            }
        } catch (error) {
            console.error('❌ Error loading student list from localStorage:', error);
        }
    }
}

// ✅ MODAL EVENT LISTENERS
document.addEventListener('DOMContentLoaded', function() {
    // Load student list from localStorage
    loadStudentList();
    
    // Handle search in faculty modal
    const facultySearchInput = document.getElementById('student-search');
    if (facultySearchInput && (window.location.pathname.includes('index.html') || !window.location.pathname.includes('student.html'))) {
        facultySearchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase().trim();
            
            if (searchTerm === '') {
                // ✅ FIX: Always sync with current allStudents
                facultyFilteredStudents = [...allStudents];
            } else {
                // ✅ FIX: Filter from current allStudents, not old cached list
                facultyFilteredStudents = allStudents.filter(student => 
                    student.toLowerCase().includes(searchTerm)
                );
            }
            
            populateFacultyStudentDropdown();
        });
    }
    
    // Handle search in student list modal
    const studentListSearchInput = document.getElementById('student-list-search');
    if (studentListSearchInput) {
        studentListSearchInput.addEventListener('input', function(e) {
            populateStudentListDisplay();
        });
    }
    
    // Handle Enter key in add student input
    const addStudentInput = document.getElementById('new-student-name');
    if (addStudentInput) {
        addStudentInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                addNewStudent();
            }
        });
    }

    // Close modals when clicking outside
    window.onclick = function(event) {
        const addModal = document.getElementById('add-manually-modal');
        const studentListModal = document.getElementById('student-list-modal');
        
        if (event.target === addModal) {
            closeAddManuallyModal();
        }
        
        if (event.target === studentListModal) {
            closeStudentListModal();
        }
    };
});
