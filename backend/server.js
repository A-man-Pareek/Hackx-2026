const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Require routes
const authRoutes = require('./modules/auth/authRoutes');
const branchRoutes = require('./modules/branches/branchRoutes');
const staffRoutes = require('./modules/staff/staffRoutes');
const reviewRoutes = require('./modules/reviews/reviewRoutes');
const responseRoutes = require('./modules/responses/responseRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/auth', authRoutes);
app.use('/branches', branchRoutes);
app.use('/staff', staffRoutes);
app.use('/reviews', reviewRoutes);
app.use('/responses', responseRoutes);

// Error handling middleware (catch-all)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error',
        code: err.status || 500
    });
});

const PORT = process.env.PORT || 8000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
