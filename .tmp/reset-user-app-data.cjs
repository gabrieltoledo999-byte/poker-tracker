const mysql = require('mysql2/promise');

const targetEmail = (process.argv[2] || '').trim().toLowerCase();
if (!targetEmail) {
  console.error('Usage: node .tmp/reset-user-app-data.cjs <email>');
  process.exit(1);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const dbUrl = new URL(databaseUrl);
  const publicHost = process.env.RAILWAY_SERVICE_MYSQL_URL;
  if (publicHost) {
    dbUrl.hostname = publicHost;
    if (!dbUrl.port) dbUrl.port = '3306';
  }

  const conn = await mysql.createConnection(dbUrl.toString());
  try {
    const [users] = await conn.execute('SELECT id, email, name FROM users WHERE LOWER(email)=? LIMIT 1', [targetEmail]);
    if (!users.length) {
      console.log(`User not found for email: ${targetEmail}`);
      return;
    }

    const user = users[0];
    const userId = user.id;

    await conn.beginTransaction();

    const [[postIdsRow]] = await conn.execute(
      'SELECT GROUP_CONCAT(id) AS ids FROM posts WHERE userId=?',
      [userId]
    );
    const postIds = postIdsRow && postIdsRow.ids ? String(postIdsRow.ids).split(',').map(Number).filter(Boolean) : [];

    if (postIds.length > 0) {
      await conn.query(`DELETE FROM post_likes WHERE postId IN (${postIds.map(() => '?').join(',')})`, postIds);
      await conn.query(`DELETE FROM post_comments WHERE postId IN (${postIds.map(() => '?').join(',')})`, postIds);
      await conn.query(`DELETE FROM post_reactions WHERE postId IN (${postIds.map(() => '?').join(',')})`, postIds);
    }

    await conn.execute('DELETE FROM post_likes WHERE userId=?', [userId]);
    await conn.execute('DELETE FROM post_comments WHERE userId=?', [userId]);
    await conn.execute('DELETE FROM post_reactions WHERE userId=?', [userId]);
    await conn.execute('DELETE FROM posts WHERE userId=?', [userId]);

    await conn.execute('DELETE FROM message_reactions WHERE userId=?', [userId]);
    await conn.execute('DELETE FROM message_reactions WHERE messageId IN (SELECT id FROM messages WHERE senderId=? OR receiverId=?)', [userId, userId]);
    await conn.execute('DELETE FROM messages WHERE senderId=? OR receiverId=?', [userId, userId]);

    await conn.execute('DELETE FROM friend_requests WHERE requesterId=? OR receiverId=?', [userId, userId]);
    await conn.execute('DELETE FROM friendships WHERE userId=? OR friendId=?', [userId, userId]);
    await conn.execute('DELETE FROM user_blocks WHERE userId=? OR blockedUserId=?', [userId, userId]);

    await conn.execute('DELETE FROM invites WHERE inviterId=? OR inviteeId=? OR LOWER(inviteeEmail)=?', [userId, userId, targetEmail]);

    await conn.execute('DELETE FROM session_tables WHERE userId=?', [userId]);
    await conn.execute('DELETE FROM active_sessions WHERE userId=?', [userId]);
    await conn.execute('DELETE FROM venue_balance_history WHERE userId=?', [userId]);
    await conn.execute('DELETE FROM sessions WHERE userId=?', [userId]);

    await conn.execute('DELETE FROM fund_transactions WHERE userId=?', [userId]);
    await conn.execute('DELETE FROM bankroll_settings WHERE userId=?', [userId]);
    await conn.execute('DELETE FROM hand_pattern_counters WHERE userId=?', [userId]);
    await conn.execute('DELETE FROM clubs WHERE userId=?', [userId]);
    await conn.execute('DELETE FROM venues WHERE userId=?', [userId]);

    await conn.execute(
      `UPDATE users
         SET preferredPlayType=NULL,
             preferredPlatforms=NULL,
             preferredFormats=NULL,
             preferredBuyIns=NULL,
             preferredBuyInsOnline=NULL,
             preferredBuyInsLive=NULL,
             playsMultiPlatform=0,
             showInGlobalRanking=0,
             showInFriendsRanking=0,
             rankingConsentAnsweredAt=NULL,
             playStyleAnsweredAt=NULL,
             onboardingCompletedAt=NULL,
             updatedAt=NOW()
       WHERE id=?`,
      [userId]
    );

    await conn.commit();

    const [counts] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM sessions WHERE userId=?) AS sessionsCount,
         (SELECT COUNT(*) FROM session_tables WHERE userId=?) AS sessionTablesCount,
         (SELECT COUNT(*) FROM active_sessions WHERE userId=?) AS activeSessionsCount,
         (SELECT COUNT(*) FROM venues WHERE userId=?) AS venuesCount,
         (SELECT COUNT(*) FROM posts WHERE userId=?) AS postsCount,
         (SELECT COUNT(*) FROM fund_transactions WHERE userId=?) AS fundTxCount`,
      [userId, userId, userId, userId, userId, userId]
    );

    console.log('Reset completed for user:', { id: userId, email: user.email, name: user.name || null });
    console.log('Remaining direct records:', counts[0]);
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    throw err;
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Reset failed:', err && err.message ? err.message : err);
  process.exit(1);
});
