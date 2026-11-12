// server/controllers/adminController.js
const bcrypt = require('bcrypt');
const db = require('../config/db'); // Adjust based on how your db connection is exported

exports.createUserAccount = async (req, res) => {
  try {
    const { email, password, role, name } = req.body;

    // Validate role
    if (!['hospital', 'regulator'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role specified. Must be hospital or regulator.' });
    }

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Please provide email, password, and name.' });
    }

    // Check if user already exists
    const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows && existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User with this email already exists.' });
    }

    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert into database (modify table/column names if your schema differs)
    const query = `
      INSERT INTO users (name, email, password, role, created_at) 
      VALUES ($1, $2, $3, $4, NOW()) 
      RETURNING id, name, email, role;
    `;
    const newUser = await db.query(query, [name, email, hashedPassword, role]);

    return res.status(201).json({
      message: `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully.`,
      user: newUser.rows[0]
    });
  } catch (error) {
    console.error('Error creating user account:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};