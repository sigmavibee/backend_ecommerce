module.exports = (upload) => {
  const router = require('express').Router();

  router.post('/', upload.single('image'), (req, res) => {
    res.json({ 
      imageUrl: `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`
    });
  });

  return router;
};