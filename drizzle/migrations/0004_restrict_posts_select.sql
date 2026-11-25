DROP POLICY IF EXISTS posts_select_all ON public.posts;
CREATE POLICY posts_select_own ON public.posts FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = posts.author_id AND p.auth_user_id = auth.uid()));