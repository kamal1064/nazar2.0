const errorHandler = (err, req, res, next) => {
    console.error('[Error] Global caught error:', err.stack || err.message || err);
    
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
};

module.exports = errorHandler;
