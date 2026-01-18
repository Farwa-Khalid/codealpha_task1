# 🌐 Connect Us

A simple social media web application where users can:  
- 👥 Follow & unfollow each other  
- 🔍 Search for other users  
- 📝 Create posts (text, image, or both)  
- ❤️ Like & 💬 comment on posts  
- 📰 View feed & profile sections  

This is an initial version, kept minimal for now but with plans to expand and polish it further in the future.  

---

## ⚙️ Tech Stack  
- **Backend:** Node.js, Express.js  
- **Database:** PostgreSQL  
- **Frontend:** EJS + TailwindCSS  
- **Authentication:** Passport.js (Local Strategy), bcrypt (password hashing), express-session  
- **File Uploads:** multer  
- **Other:** body-parser, path  

---

## 🚀 Getting Started  

1. Clone the repository  
   ```bash
   git clone https://github.com/your-username/connect-us.git
   cd connect-us
   ```  

2. Install dependencies  
   ```bash
   npm install
   ```  

3. Set up a `.env` file in the root directory with the following variables:  
   ```env
   DATABASE_URL=your_postgres_connection_string
   SESSION_SECRET=your_session_secret
   PORT=3000
   ```  

4. Run the app  
   ```bash
   npm start
   ```  

---

## 📸 Features Preview  
*(Add screenshots here if you have them, e.g., feed, profile, post form)*  

---

## ✨ Future Improvements  
- Real-time notifications  
- Better UI/UX with animations  
- API endpoints for mobile integration  
- Advanced profile customization  

---

## 📌 Status  
This is a learning project – functional but simple. Future versions will include more robust features.  
