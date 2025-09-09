---
# Orbit CRM – Back-End API
---

Orbit CRM API powers the Orbit personal CRM.  
Built with Node.js, Express, and MongoDB, the API provides secure endpoints for authentication and full CRUD operations on users, groups, and contacts.

## Related

- **Front-End Repo**: [Orbit CRM Client]([CRM-react-front-end](https://github.com/Snowflaker1080/OrbitCRM/tree/main/CRM-react-front-end))

## Features

- JWT Authentication (sign up, sign in, sign out)  
- User authorisation (only the creator can update/delete their data)  
- RESTful CRUD routes for:  
  - **Users**  
  - **Groups** (cohorts, networks, friend groups)  
  - **Contacts** (with location, social links, reminders)  
- Password hashing with bcrypt  
- Middleware for verifying JWT tokens  

## Technologies Used

- Node.js  
- Express.js  
- MongoDB + Mongoose  
- JWT (jsonwebtoken)  
- bcrypt  
- cors, morgan, dotenv  

## Getting Started

### 1. Clone Repository

	```bash
	git clone https://github.com/Snowflaker1080/OrbitCRM.git
	cd CRM-express-api-back-end

### 2. Install Dependencies
   
	```bash
	npm install
	
### 3. Environment Variables
   Create .env in the project root:

 	```bash
   	PORT=3000
	MONGODB_URI=mongodb://localhost:27017/OrbitCRMDatabase
	JWT_SECRET=your-super-secret-key

### 4. Start API Server

 	```bash
   	npm run dev   # development (nodemon)
	npm start     # production

  Runs on http://localhost:3000.

## API Reference

| Method | Endpoint              | Description |
|--------|-----------------------|-------------|
| POST   | `/api/auth/sign-up`   | Register a new user |
| POST   | `/api/auth/sign-in`   | Authenticate user and return JWT |
| GET    | `/api/users/me`       | Get current authenticated user |
| POST   | `/api/groups`         | Create a new group |
| GET    | `/api/groups`         | Get all groups |
| GET    | `/api/groups/:id`     | Get a single group by ID |
| PUT    | `/api/groups/:id`     | Update a group |
| DELETE | `/api/groups/:id`     | Delete a group |
| POST   | `/api/contacts`       | Create a new contact |
| GET    | `/api/contacts`       | Get all contacts |
| GET    | `/api/contacts/:id`   | Get a single contact by ID |
| PUT    | `/api/contacts/:id`   | Update a contact |
| DELETE | `/api/contacts/:id`   | Delete a contact |

## Authentication & Authorisation

- Guests: only sign up / sign in
- Signed-in users: can create and manage their own groups and contacts
- Users cannot edit or delete data created by others

## Next Steps

- Mobile app version (React Native)  
- Calendar integration for reminders  
- Duplicate contact merge  

## Licence

MIT Licence


