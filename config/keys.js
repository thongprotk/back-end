module.exports = {
  google: {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  session: {
    cookieKey: "thenbuitrungthongguess",
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "refresh-secret",
  },
};
