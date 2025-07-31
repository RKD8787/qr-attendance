# QR Attendance System

<div align="center">

![QR Attendance](https://img.shields.io/badge/QR-Attendance-blue?style=for-the-badge)
![JavaScript](https://img.shields.io/badge/JavaScript-42.8%25-yellow?style=for-the-badge&logo=javascript)
![HTML](https://img.shields.io/badge/HTML-37.1%25-orange?style=for-the-badge&logo=html5)
![CSS](https://img.shields.io/badge/CSS-20.1%25-blue?style=for-the-badge&logo=css3)

A comprehensive QR-based attendance management system for Dayananda Sagar College Of Engineering
</div>

## 🌟 Core Features

### Faculty Dashboard
- **Session Management**
  - Create and manage attendance sessions
  - Real-time session monitoring
  - Archive and delete sessions
  - Session history with detailed analytics
  - Multiple verification methods support

- **Course Management**
  - Create, edit, and delete courses
  - Course-wise attendance tracking
  - Course-specific session creation
  - Course statistics and analytics

- **QR Code Generation**
  - Dynamic QR code generation for each session
  - Automatic session linking
  - Direct URL access option
  - Copy/share functionality for QR codes

### Student Portal
- **User-Friendly Interface**
  - Mobile-responsive design
  - Easy student selection
  - Quick attendance submission
  - Success confirmation system

- **Multi-Factor Verification**
  - Location-based verification
  - Fingerprint verification support
  - Manual verification fallback
  - Duplicate submission prevention

### Advanced Analytics
- **Comprehensive Statistics**
  - Daily attendance trends
  - Verification method distribution
  - Student-wise attendance reports
  - Course-wise attendance analysis

- **Data Visualization**
  - Interactive charts and graphs
  - 30-day attendance trends
  - Verification method distribution charts
  - Real-time statistics updates

### Data Management
- **Export Capabilities**
  - CSV export for attendance data
  - Session-wise exports
  - Detailed attendance records
  - Custom date range exports

- **Real-time Features**
  - Live attendance updates
  - Real-time student list
  - Active session monitoring
  - Instant verification status

## 🛠️ Technical Features

### Frontend
- **Modern UI Components**
  - Responsive modals
  - Toast notifications
  - Loading animations
  - Interactive charts
  - Accessibility features

- **Progressive Enhancement**
  - Offline support
  - PWA capabilities
  - Performance optimization
  - Cross-browser compatibility

### Backend (Supabase)
- **Database Structure**
  - Students management
  - Course tracking
  - Session records
  - Attendance logging
  - Verification data

- **Security Features**
  - Authentication system
  - Role-based access control
  - Data validation
  - Secure API endpoints

## 📋 Prerequisites

- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection for real-time features
- Supabase account for backend services
- Node.js (recommended for development)

## 🚀 Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/RKD8787/qr-attendance.git
   ```

2. Navigate to project directory:
   ```bash
   cd qr-attendance
   ```

3. Configure Supabase:
   - Create a Supabase project
   - Set up the required tables (students, courses, sessions, attendance)
   - Configure authentication

4. Set up environment variables:
   - Create `.env` file
   - Add Supabase credentials
   - Configure any additional settings

5. Start the application:
   ```bash
   # Using any static file server
   npx http-server ./public
   ```

## 💡 Usage Guide

### For Faculty

1. **Login**
   - Access the faculty portal
   - Authenticate using credentials

2. **Session Management**
   - Create new sessions
   - Select course and parameters
   - Generate QR code
   - Monitor attendance

3. **Attendance Monitoring**
   - View real-time attendance
   - Check verification status
   - Export attendance data
   - View statistics

### For Students

1. **Access**
   - Scan session QR code
   - Or use direct URL

2. **Mark Attendance**
   - Select name from list
   - Complete verification steps
   - Submit attendance
   - Receive confirmation

3. **Verification**
   - Allow location access (if required)
   - Complete fingerprint verification (if enabled)
   - Wait for confirmation

## 🔒 Security Implementation

- **Authentication**
  - Secure login system
  - Session management
  - Role-based access

- **Data Protection**
  - Input validation
  - XSS prevention
  - CSRF protection
  - Secure API calls

- **Verification Methods**
  - Location verification
  - Fingerprint support
  - Multiple factor authentication
  - Duplicate submission prevention

## 📊 Analytics Features

- **Attendance Trends**
  - Daily attendance graphs
  - Course-wise statistics
  - Student participation rates
  - Verification method distribution

- **Reporting**
  - Detailed attendance reports
  - Custom date range selection
  - Multiple export formats
  - Real-time data updates

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Contact

RKD8787 - [GitHub Profile](https://github.com/RKD8787)

Project Link: [https://github.com/RKD8787/qr-attendance](https://github.com/RKD8787/qr-attendance)

---

<div align="center">
⭐ Star this repository if you find it helpful!
</div>
