module.exports = {
  google: {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  session: {
    cookieKey: "ebc92606b698de01eea96fa6361f0cb532349b0f45a039be841c1c0e8985091e",
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "refresh-secret",
  },
};
