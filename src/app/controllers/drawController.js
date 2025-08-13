class DrawController {
  // [GET] /gamePlay
  index(req, res) {
    const playerName = req.query.playerName;
    res.render('gamePlay', { playerName });
  }
}

module.exports = new DrawController();
