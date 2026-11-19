# 🏫 PMEC Hostel Management System

A full-stack web application for managing hostel operations at **PMEC (P. M. Engineering College)**. It covers student registration and profiles, hostel/room assignments, food-preference tracking, meal cancellations, monthly billing, vendor management, notice boards, and role-based dashboards for **Admin**, **Students**, and **Food Vendors**.

---

## 📑 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Installation & Setup](#-installation--setup)
- [Environment Variables](#-environment-variables)
- [Running the Application](#-running-the-application)
- [API Overview](#-api-overview)
- [Database Models](#-database-models)
- [Pages & Roles](#-pages--roles)
- [Security](#-security)
- [Contributing](#-contributing)

---

## ✨ Features

### 🔐 Authentication
- Separate login for **Admin**, **Students**, and **Vendors**
- Password reset flow via email (Nodemailer)
- Session-based role routing after login

### 🏠 Admin Dashboard (`admin.html`)
- Add / edit / delete student records (bulk import via CSV)
- Manage hostels and room assignments
- Add / manage food vendors with contract file uploads
- Post hostel-wide notices
- Define and update hostel policies
- Approve / reject leave / food-cancellation requests
- View monthly billing summary for vendors
- Student billing management

### 🎓 Student Interface (`student_interface.html`)
- View personal profile and room/hostel details
- Submit food-preference changes (veg / non-veg / egg)
- Apply for meal cancellation (leave) with date range
- View personal billing history
- Read notices and hostel policies

### 🍽️ Vendor Dashboard (`vendor_dashboard.html`)
- View assigned hostel and active student count
- Upload / update weekly menu image
- View detailed monthly meal billing
- Receive student feedback and ratings

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Backend** | Node.js, Express.js v5 |
| **Database** | MongoDB (Mongoose ODM) — two databases |
| **Auth** | bcryptjs (password hashing) |
| **File Upload** | Multer (contract PDFs, menu images) |
| **Email** | Nodemailer (SMTP) |
| **CSV Import** | csv-parse |
| **Security** | XSS sanitization, NoSQL injection blocking middleware |

---

## 📁 Project Structure

```
PmecHostelManagement-main/
│
├── front_page.html          # Landing / home page
├── login.html               # Unified login portal
├── reset-password.html      # Password reset page
├── admin.html               # Admin dashboard
├── student_interface.html   # Student portal
├── vendor_dashboard.html    # Vendor portal
│
├── *.css                    # Stylesheets per page
├── *.js                     # Frontend JS per page
│
├── server1.js               # Lightweight standalone server (legacy)
│
└── backend/
    ├── server.js            # ⭐ Main Express API server (port 5000)
    ├── studentDb.js         # studentDB connection helper
    ├── package.json         # Node dependencies & scripts
    ├── .env.example         # Environment variable template
    │
    ├── models/              # Mongoose schemas
    │   ├── AddAdmin.js      # Admin users
    │   ├── Cancellation.js  # Leave / cancellation requests
    │   ├── Foodcancel.js    # Food-specific cancellations
    │   ├── Hostel.js        # Hostel records
    │   ├── Monthlybillentry.js  # Monthly bill entries
    │   ├── Notice.js        # Admin notices
    │   ├── Policy.js        # Hostel policies
    │   ├── Preference.js    # Student food preferences
    │   ├── Student.js       # Student records (adminDB)
    │   ├── User.js          # Logged-in user records (studentDB)
    │   ├── Vendor.js        # Vendor records
    │   ├── studentbilling.js   # Student-side billing
    │   ├── studentnotice.js    # Student notice reads
    │   └── vendorfeedback.js   # Vendor ratings / feedback
    │
    └── uploads/             # Uploaded files (contracts, menus, photos)
```

---

## ✅ Prerequisites

Make sure the following are installed on your machine:

| Tool | Version | Download |
|------|---------|----------|
| **Node.js** | ≥ 18.x | https://nodejs.org |
| **npm** | ≥ 9.x (bundled with Node) | — |
| **MongoDB Community** | ≥ 6.x | https://www.mongodb.com/try/download/community |
| **Git** | any | https://git-scm.com |

> **Windows users**: Make sure the MongoDB service is running. You can start it with:
> `net start MongoDB` (in an Administrator PowerShell)

---

## 🚀 Installation & Setup

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/PmecHostelManagement.git
cd PmecHostelManagement-main
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

This installs all packages listed in `backend/package.json`:

| Package | Purpose |
|---------|---------|
| `express` | HTTP server & routing |
| `mongoose` | MongoDB ODM |
| `cors` | Cross-origin resource sharing |
| `multer` | File upload handling |
| `bcryptjs` | Password hashing |
| `jsonwebtoken` | JWT utilities |
| `nodemailer` | Email sending (SMTP) |
| `csv-parse` | Bulk student CSV import |
| `dotenv` | Environment variable loader |
| `crypto` | Built-in crypto (listed for compatibility) |

### 3. Configure environment variables

```bash
cd backend
copy .env.example .env   # Windows
# or
cp .env.example .env     # macOS / Linux
```

Edit `.env` with your actual values (see [Environment Variables](#-environment-variables) below).

### 4. Start MongoDB

Ensure MongoDB is running locally on port **27017**.
The app uses two databases automatically created on first run:

- **`adminDB`** — stores admins, students, hostels, notices, policies, vendors, billing
- **`studentDB`** — stores user login info, food preferences, cancellations

---

## ⚙️ Environment Variables

Copy `backend/.env.example` → `backend/.env` and fill in:

```env
# MongoDB URIs
ADMIN_DB_URI=mongodb://127.0.0.1:27017/adminDB
STUDENT_DB_URI=mongodb://127.0.0.1:27017/studentDB

# Server port
PORT=5000

# SMTP (for password reset emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
```

> **Gmail users**: Enable 2-Step Verification and generate an **App Password** at
> https://myaccount.google.com/apppasswords

---

## ▶️ Running the Application

### Development (with auto-restart on file changes)

```bash
cd backend
npm run dev
```

### Production

```bash
cd backend
npm start
```

Open your browser at:

```
http://localhost:5000
```

The server serves all frontend HTML files statically, so no separate frontend server is needed.

| URL | Page |
|-----|------|
| `http://localhost:5000` | Landing page |
| `http://localhost:5000/login.html` | Login portal |
| `http://localhost:5000/admin.html` | Admin dashboard |
| `http://localhost:5000/student_interface.html` | Student portal |
| `http://localhost:5000/vendor_dashboard.html` | Vendor portal |

---

## 🌐 API Overview

All API routes are served from `backend/server.js` on **port 5000**.

### Auth & Users
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/login` | Unified login (admin / student / vendor) |
| `POST` | `/api/reset-password` | Send password reset email |

### Students
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/students` | List all students |
| `POST` | `/api/students` | Add a student |
| `PUT` | `/api/students/:id` | Update student |
| `DELETE` | `/api/students/:id` | Delete student |
| `POST` | `/api/students/import` | Bulk import from CSV |

### Hostels & Rooms
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/hostels` | List hostels |
| `POST` | `/api/hostels` | Add hostel |
| `PUT` | `/api/hostels/:id` | Update hostel |

### Notices & Policies
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/notices` | Get all notices |
| `POST` | `/api/notices` | Create a notice |
| `DELETE` | `/api/notices/:id` | Delete notice |
| `GET` | `/api/policies` | Get policies |
| `POST` | `/api/policies` | Create/update policy |

### Food Preferences & Cancellations
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/preferences` | Student food preferences |
| `POST` | `/api/preferences` | Submit preference |
| `GET` | `/api/cancellations` | Leave / food cancel requests |
| `POST` | `/api/cancellations` | Submit cancellation request |
| `PUT` | `/api/cancellations/:id` | Approve / reject request |

### Billing
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/billing/:studentId` | Get student billing |
| `GET` | `/api/vendor/billing` | Vendor monthly billing summary |

### Vendors
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/vendors` | List vendors |
| `POST` | `/api/vendors` | Add vendor |
| `PUT` | `/api/vendors/:id` | Update vendor |
| `DELETE` | `/api/vendors/:id` | Delete vendor |
| `POST` | `/api/vendors/:id/menu` | Upload weekly menu image |
| `POST` | `/api/vendors/:id/feedback` | Submit vendor feedback |

---

## 🗃️ Database Models

| Model | Database | Collection | Description |
|-------|----------|------------|-------------|
| `Admin` | adminDB | `Admins` | Admin accounts |
| `Student` | adminDB | `SDetails` | Student master data |
| `Hostel` | adminDB | `Hostels` | Hostel rooms & capacity |
| `Notice` | adminDB | `Notices` | Admin announcements |
| `Policy` | adminDB | `Policies` | Hostel rules |
| `Vendor` | adminDB | `Vendors` | Food vendor records |
| `MonthlyBillEntry` | adminDB | — | Bill entries per month |
| `User` | studentDB | — | Login credentials |
| `Preference` | studentDB | — | Meal type preferences |
| `Cancellation` | studentDB | — | Leave/absence requests |
| `FoodCancel` | studentDB | — | Food-specific cancellations |
| `StudentBilling` | studentDB | — | Student payment records |
| `VendorFeedback` | studentDB | — | Ratings submitted by students |

---

## 👥 Pages & Roles

| Role | Entry Point | Key Capabilities |
|------|------------|-----------------|
| **Admin** | `login.html` → `admin.html` | Full CRUD, billing, vendor management |
| **Student** | `login.html` → `student_interface.html` | Profile, preferences, cancellations, billing |
| **Vendor** | `login.html` → `vendor_dashboard.html` | Menu upload, billing view, feedback |

> Default vendor password (set at creation): `Password@123`

---

## 🔒 Security

The server includes built-in middleware to prevent common attacks:

- **XSS prevention** — strips `<script>` and HTML tags from all string inputs
- **NoSQL Injection blocking** — rejects any request body/query keys starting with `$`
- Applied globally via `app.use(sanitizeMiddleware)` **before** all route handlers

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push the branch: `git push origin feature/your-feature`
5. Open a Pull Request

Please follow the existing code style and keep each PR focused on a single concern.

---

## 📄 License

This project is for educational purposes at **PMEC**. All rights reserved by the respective authors.
