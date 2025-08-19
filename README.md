# 🛍️ The Essentials Shop  

The **Essentials Shop** is a full-stack **E-commerce web application** built with **Node.js, Express, PostgreSQL, and EJS templating**.  
It includes secure authentication, product management, cart & checkout system, stock handling, and order confirmation via email.  

This project was developed as part of my **CodeAlpha Internship Task 1**. 🚀  

---

## ✨ Features  

- 🔑 **User Authentication** (Signup/Login with password hashing using `bcrypt`)  
- 🛒 **Cart & Checkout System**  
- 📦 **Stock Management** (auto quantity update after purchase)  
- 💌 **Email Notifications** (order confirmation using `nodemailer`)  
- 🖼️ **Dynamic Frontend** with **EJS templating**  
- 🗄️ **PostgreSQL Database Integration**  
- ⚡ **Full-stack Architecture** with MVC structure  

---

## 📂 Tech Stack  

- **Frontend**: EJS, CSS  
- **Backend**: Node.js, Express.js  
- **Database**: PostgreSQL  
- **Authentication**: bcrypt for hashing  
- **Email Service**: Nodemailer  

---

📌 Note for Others Using This Project

You must set up your own PostgreSQL database and email credentials in the .env file.

API keys, DB passwords, and sensitive credentials are not shared in this repo for security reasons.

Without proper .env configuration, the project will not run successfully.

---

## 🚀 Getting Started  

Follow these steps to run the project locally:

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/Farwa-Khalid/codealpha_task1.git
cd Ecommerce-store
npm init -y
npm i
nodemon index.js

---
##📬 Contact

👩‍💻 Developed by Farwa Khalid