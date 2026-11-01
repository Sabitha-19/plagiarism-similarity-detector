# FacultyLog – Student Attendance Management System

FacultyLog is a web-based Student Attendance Management System developed using Python and Streamlit. It helps faculty manage student details, record attendance, monitor attendance percentages, and generate downloadable Excel attendance reports.

## Features

- **Student Management:** Add, edit, search, and manage student records.
- **Attendance Tracking:** Record daily student attendance.
- **Attendance Status:** Supports Present (P), Absent (A), and On Duty (OD).
- **Automated Calculations:** Calculate attendance hours, percentages, and attendance marks.
- **Excel Reports:** Download formatted monthly and semester-wise attendance registers.
- **Report Generation:** View student-wise and monthly attendance reports.
- **Database Management:** Store student and attendance records using SQLite.
- **Holiday Management:** Manage holidays in the attendance calendar.

## Technologies Used

- Python
- Streamlit
- SQLite
- Pandas
- Plotly
- OpenPyXL

## Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR-USERNAME/FacultyLog-Student-Attendance-Management-System.git
```

### 2. Navigate to the Project Folder

```bash
cd FacultyLog-Student-Attendance-Management-System
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Run the Application

```bash
streamlit run app.py
```

Open the local URL displayed in your terminal to access FacultyLog.

## Project Structure

```text
FacultyLog/
│
├── app.py
├── requirements.txt
├── README.md
└── database/
    └── attendance.db
```

*Note: The actual project structure may vary depending on the uploaded source code.*

## Attendance Status

| Status | Meaning |
|---|---|
| P | Present |
| A | Absent |
| OD | On Duty |

OD is displayed separately and treated as present according to the attendance calculation rules.

## Excel Reports

FacultyLog generates formatted Excel attendance registers with:

- Student details
- Date-wise attendance
- Colour-coded attendance status
- Total hours attended
- Attendance percentage
- Attendance marks

## Purpose

The main objective of FacultyLog is to simplify attendance management, reduce manual calculations, improve accuracy, and make attendance reporting easier for faculty members.

## Future Enhancements

- Improved analytics and visual reports
- Additional report formats
- Enhanced user experience

## Author

**S. Sabitha**

B.Tech – Information Science and Engineering

## License

This project is developed for academic and educational purposes.</
