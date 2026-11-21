DROP POLICY IF EXISTS "follows_select_all" ON public.follows;
CREATE POLICY "follows_select_involved" ON public.follows FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.auth_user_id = auth.uid() AND (p.id = follows.follower_id OR p.id = follows.following_id)));

DROP POLICY IF EXISTS "likes_select_all" ON public.likes;
CREATE POLICY "likes_select_own" ON public.likes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.auth_user_id = auth.uid() AND p.id = likes.user_id));

DROP POLICY IF EXISTS "comments_select_all" ON public.comments;
CREATE POLICY "comments_select_own" ON public.comments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.auth_user_id = auth.uid() AND p.id = comments.user_id));

DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = auth_user_id);