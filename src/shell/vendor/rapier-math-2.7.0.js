/*!
MIT License

Copyright (c) 2026 Jack Skipworth

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
/*!
Copyright 2012--2014 for Latin Modern Math OTF by B. Jackowski, P. Strzelczyk and P. Pianowski (on behalf of TeX users groups). This work is released under the GUST Font License -- see http://tug.org/fonts/licenses/GUST-FONT-LICENSE.txt for details.

Copyright 2003, 2009 B. Jackowski and J. M. Nowacki (on behalf of TeX users groups). This work is released under the GUST Font License --  see http://tug.org/fonts/licenses/GUST-FONT-LICENSE.txt for details.

Copyright 2003--2009 by B. Jackowski and J.M. Nowacki (on behalf of TeX USERS GROUPS).

Rapier math font data, derived from Latin Modern Math 1.959,
text outlines from Latin Modern Mono 2.004, and one arrow hook
from Latin Modern Math Italic 10 Regular 2.003.
Changes: SVG outline conversion, character and MATH data extraction,
optical-form closure and lossless path packing.
Original outlines are unchanged. Hinting and text shaping tables are omitted.
The font authors do not maintain this conversion.
Complete original work: https://mirrors.ctan.org/fonts/lm-math.zip
Mono and hook original work: https://mirrors.ctan.org/fonts/lm.zip
Conversion details: FONT-SOURCE.md.

% This is a preliminary version (2006-09-30), barring acceptance from
% the LaTeX Project Team and other feedback, of the GUST Font License.
% (GUST is the Polish TeX Users Group, http://www.gust.org.pl)
%
% For the most recent version of this license see
% http://www.gust.org.pl/fonts/licenses/GUST-FONT-LICENSE.txt
% or
% http://tug.org/fonts/licenses/GUST-FONT-LICENSE.txt
%
% This work may be distributed and/or modified under the conditions
% of the LaTeX Project Public License, either version 1.3c of this
% license or (at your option) any later version.
% 
% Please also observe the following clause:
% 1) it is requested, but not legally required, that derived works be
%    distributed only after changing the names of the fonts comprising this
%    work and given in an accompanying "manifest", and that the
%    files comprising the Work, as listed in the manifest, also be given
%    new names. Any exceptions to this request are also given in the
%    manifest.
%    
%    We recommend the manifest be given in a separate file named
%    MANIFEST-<fontid>.txt, where <fontid> is some unique identification
%    of the font family. If a separate "readme" file accompanies the Work, 
%    we recommend a name of the form README-<fontid>.txt.
%
% The latest version of the LaTeX Project Public License is in
% http://www.latex-project.org/lppl.txt and version 1.3c or later
% is part of all distributions of LaTeX version 2006/05/20 or later.


The LaTeX Project Public License
=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

LPPL Version 1.3c  2008-05-04

Copyright 1999 2002-2008 LaTeX3 Project
    Everyone is allowed to distribute verbatim copies of this
    license document, but modification of it is not allowed.


PREAMBLE
========

The LaTeX Project Public License (LPPL) is the primary license under
which the LaTeX kernel and the base LaTeX packages are distributed.

You may use this license for any work of which you hold the copyright
and which you wish to distribute.  This license may be particularly
suitable if your work is TeX-related (such as a LaTeX package), but 
it is written in such a way that you can use it even if your work is 
unrelated to TeX.

The section `WHETHER AND HOW TO DISTRIBUTE WORKS UNDER THIS LICENSE',
below, gives instructions, examples, and recommendations for authors
who are considering distributing their works under this license.

This license gives conditions under which a work may be distributed
and modified, as well as conditions under which modified versions of
that work may be distributed.

We, the LaTeX3 Project, believe that the conditions below give you
the freedom to make and distribute modified versions of your work
that conform with whatever technical specifications you wish while
maintaining the availability, integrity, and reliability of
that work.  If you do not see how to achieve your goal while
meeting these conditions, then read the document `cfgguide.tex'
and `modguide.tex' in the base LaTeX distribution for suggestions.


DEFINITIONS
===========

In this license document the following terms are used:

   `Work'
    Any work being distributed under this License.
    
   `Derived Work'
    Any work that under any applicable law is derived from the Work.

   `Modification' 
    Any procedure that produces a Derived Work under any applicable
    law -- for example, the production of a file containing an
    original file associated with the Work or a significant portion of
    such a file, either verbatim or with modifications and/or
    translated into another language.

   `Modify'
    To apply any procedure that produces a Derived Work under any
    applicable law.
    
   `Distribution'
    Making copies of the Work available from one person to another, in
    whole or in part.  Distribution includes (but is not limited to)
    making any electronic components of the Work accessible by
    file transfer protocols such as FTP or HTTP or by shared file
    systems such as Sun's Network File System (NFS).

   `Compiled Work'
    A version of the Work that has been processed into a form where it
    is directly usable on a computer system.  This processing may
    include using installation facilities provided by the Work,
    transformations of the Work, copying of components of the Work, or
    other activities.  Note that modification of any installation
    facilities provided by the Work constitutes modification of the Work.

   `Current Maintainer'
    A person or persons nominated as such within the Work.  If there is
    no such explicit nomination then it is the `Copyright Holder' under
    any applicable law.

   `Base Interpreter' 
    A program or process that is normally needed for running or
    interpreting a part or the whole of the Work.    

    A Base Interpreter may depend on external components but these
    are not considered part of the Base Interpreter provided that each
    external component clearly identifies itself whenever it is used
    interactively.  Unless explicitly specified when applying the
    license to the Work, the only applicable Base Interpreter is a
    `LaTeX-Format' or in the case of files belonging to the 
    `LaTeX-format' a program implementing the `TeX language'.



CONDITIONS ON DISTRIBUTION AND MODIFICATION
===========================================

1.  Activities other than distribution and/or modification of the Work
are not covered by this license; they are outside its scope.  In
particular, the act of running the Work is not restricted and no
requirements are made concerning any offers of support for the Work.

2.  You may distribute a complete, unmodified copy of the Work as you
received it.  Distribution of only part of the Work is considered
modification of the Work, and no right to distribute such a Derived
Work may be assumed under the terms of this clause.

3.  You may distribute a Compiled Work that has been generated from a
complete, unmodified copy of the Work as distributed under Clause 2
above, as long as that Compiled Work is distributed in such a way that
the recipients may install the Compiled Work on their system exactly
as it would have been installed if they generated a Compiled Work
directly from the Work.

4.  If you are the Current Maintainer of the Work, you may, without
restriction, modify the Work, thus creating a Derived Work.  You may
also distribute the Derived Work without restriction, including
Compiled Works generated from the Derived Work.  Derived Works
distributed in this manner by the Current Maintainer are considered to
be updated versions of the Work.

5.  If you are not the Current Maintainer of the Work, you may modify
your copy of the Work, thus creating a Derived Work based on the Work,
and compile this Derived Work, thus creating a Compiled Work based on
the Derived Work.

6.  If you are not the Current Maintainer of the Work, you may
distribute a Derived Work provided the following conditions are met
for every component of the Work unless that component clearly states
in the copyright notice that it is exempt from that condition.  Only
the Current Maintainer is allowed to add such statements of exemption 
to a component of the Work. 

  a. If a component of this Derived Work can be a direct replacement
     for a component of the Work when that component is used with the
     Base Interpreter, then, wherever this component of the Work
     identifies itself to the user when used interactively with that
     Base Interpreter, the replacement component of this Derived Work
     clearly and unambiguously identifies itself as a modified version
     of this component to the user when used interactively with that
     Base Interpreter.
     
  b. Every component of the Derived Work contains prominent notices
     detailing the nature of the changes to that component, or a
     prominent reference to another file that is distributed as part
     of the Derived Work and that contains a complete and accurate log
     of the changes.
  
  c. No information in the Derived Work implies that any persons,
     including (but not limited to) the authors of the original version
     of the Work, provide any support, including (but not limited to)
     the reporting and handling of errors, to recipients of the
     Derived Work unless those persons have stated explicitly that
     they do provide such support for the Derived Work.

  d. You distribute at least one of the following with the Derived Work:

       1. A complete, unmodified copy of the Work; 
          if your distribution of a modified component is made by
          offering access to copy the modified component from a
          designated place, then offering equivalent access to copy
          the Work from the same or some similar place meets this
          condition, even though third parties are not compelled to
          copy the Work along with the modified component;

       2. Information that is sufficient to obtain a complete,
          unmodified copy of the Work.

7.  If you are not the Current Maintainer of the Work, you may
distribute a Compiled Work generated from a Derived Work, as long as
the Derived Work is distributed to all recipients of the Compiled
Work, and as long as the conditions of Clause 6, above, are met with
regard to the Derived Work.

8.  The conditions above are not intended to prohibit, and hence do not
apply to, the modification, by any method, of any component so that it
becomes identical to an updated version of that component of the Work as
it is distributed by the Current Maintainer under Clause 4, above.

9.  Distribution of the Work or any Derived Work in an alternative
format, where the Work or that Derived Work (in whole or in part) is
then produced by applying some process to that format, does not relax or
nullify any sections of this license as they pertain to the results of
applying that process.
     
10. a. A Derived Work may be distributed under a different license
       provided that license itself honors the conditions listed in
       Clause 6 above, in regard to the Work, though it does not have
       to honor the rest of the conditions in this license.
      
    b. If a Derived Work is distributed under a different license, that
       Derived Work must provide sufficient documentation as part of
       itself to allow each recipient of that Derived Work to honor the 
       restrictions in Clause 6 above, concerning changes from the Work.

11. This license places no restrictions on works that are unrelated to
the Work, nor does this license place any restrictions on aggregating
such works with the Work by any means.

12.  Nothing in this license is intended to, or may be used to, prevent
complete compliance by all parties with all applicable laws.


NO WARRANTY
===========

There is no warranty for the Work.  Except when otherwise stated in
writing, the Copyright Holder provides the Work `as is', without
warranty of any kind, either expressed or implied, including, but not
limited to, the implied warranties of merchantability and fitness for a
particular purpose.  The entire risk as to the quality and performance
of the Work is with you.  Should the Work prove defective, you assume
the cost of all necessary servicing, repair, or correction.

In no event unless required by applicable law or agreed to in writing
will The Copyright Holder, or any author named in the components of the
Work, or any other party who may distribute and/or modify the Work as
permitted above, be liable to you for damages, including any general,
special, incidental or consequential damages arising out of any use of
the Work or out of inability to use the Work (including, but not limited
to, loss of data, data being rendered inaccurate, or losses sustained by
anyone as a result of any failure of the Work to operate with any other
programs), even if the Copyright Holder or said author or said other
party has been advised of the possibility of such damages.


MAINTENANCE OF THE WORK
=======================

The Work has the status `author-maintained' if the Copyright Holder
explicitly and prominently states near the primary copyright notice in
the Work that the Work can only be maintained by the Copyright Holder
or simply that it is `author-maintained'.

The Work has the status `maintained' if there is a Current Maintainer
who has indicated in the Work that they are willing to receive error
reports for the Work (for example, by supplying a valid e-mail
address). It is not required for the Current Maintainer to acknowledge
or act upon these error reports.

The Work changes from status `maintained' to `unmaintained' if there
is no Current Maintainer, or the person stated to be Current
Maintainer of the work cannot be reached through the indicated means
of communication for a period of six months, and there are no other
significant signs of active maintenance.

You can become the Current Maintainer of the Work by agreement with
any existing Current Maintainer to take over this role.

If the Work is unmaintained, you can become the Current Maintainer of
the Work through the following steps:

 1.  Make a reasonable attempt to trace the Current Maintainer (and
     the Copyright Holder, if the two differ) through the means of
     an Internet or similar search.

 2.  If this search is successful, then enquire whether the Work
     is still maintained.

  a. If it is being maintained, then ask the Current Maintainer
     to update their communication data within one month.
     
  b. If the search is unsuccessful or no action to resume active
     maintenance is taken by the Current Maintainer, then announce
     within the pertinent community your intention to take over
     maintenance.  (If the Work is a LaTeX work, this could be
     done, for example, by posting to comp.text.tex.)

 3a. If the Current Maintainer is reachable and agrees to pass
     maintenance of the Work to you, then this takes effect
     immediately upon announcement.
     
  b. If the Current Maintainer is not reachable and the Copyright
     Holder agrees that maintenance of the Work be passed to you,
     then this takes effect immediately upon announcement.  
    
 4.  If you make an `intention announcement' as described in 2b. above
     and after three months your intention is challenged neither by
     the Current Maintainer nor by the Copyright Holder nor by other
     people, then you may arrange for the Work to be changed so as
     to name you as the (new) Current Maintainer.
     
 5.  If the previously unreachable Current Maintainer becomes
     reachable once more within three months of a change completed
     under the terms of 3b) or 4), then that Current Maintainer must
     become or remain the Current Maintainer upon request provided
     they then update their communication data within one month.

A change in the Current Maintainer does not, of itself, alter the fact
that the Work is distributed under the LPPL license.

If you become the Current Maintainer of the Work, you should
immediately provide, within the Work, a prominent and unambiguous
statement of your status as Current Maintainer.  You should also
announce your new status to the same pertinent community as
in 2b) above.


WHETHER AND HOW TO DISTRIBUTE WORKS UNDER THIS LICENSE
======================================================

This section contains important instructions, examples, and
recommendations for authors who are considering distributing their
works under this license.  These authors are addressed as `you' in
this section.

Choosing This License or Another License
----------------------------------------

If for any part of your work you want or need to use *distribution*
conditions that differ significantly from those in this license, then
do not refer to this license anywhere in your work but, instead,
distribute your work under a different license.  You may use the text
of this license as a model for your own license, but your license
should not refer to the LPPL or otherwise give the impression that
your work is distributed under the LPPL.

The document `modguide.tex' in the base LaTeX distribution explains
the motivation behind the conditions of this license.  It explains,
for example, why distributing LaTeX under the GNU General Public
License (GPL) was considered inappropriate.  Even if your work is
unrelated to LaTeX, the discussion in `modguide.tex' may still be
relevant, and authors intending to distribute their works under any
license are encouraged to read it.

A Recommendation on Modification Without Distribution
-----------------------------------------------------

It is wise never to modify a component of the Work, even for your own
personal use, without also meeting the above conditions for
distributing the modified component.  While you might intend that such
modifications will never be distributed, often this will happen by
accident -- you may forget that you have modified that component; or
it may not occur to you when allowing others to access the modified
version that you are thus distributing it and violating the conditions
of this license in ways that could have legal implications and, worse,
cause problems for the community.  It is therefore usually in your
best interest to keep your copy of the Work identical with the public
one.  Many works provide ways to control the behavior of that work
without altering any of its licensed components.

How to Use This License
-----------------------

To use this license, place in each of the components of your work both
an explicit copyright notice including your name and the year the work
was authored and/or last substantially modified.  Include also a
statement that the distribution and/or modification of that
component is constrained by the conditions in this license.

Here is an example of such a notice and statement:

  %% pig.dtx
  %% Copyright 2008 M. Y. Name
  %
  % This work may be distributed and/or modified under the
  % conditions of the LaTeX Project Public License, either version 1.3
  % of this license or (at your option) any later version.
  % The latest version of this license is in
  %   https://www.latex-project.org/lppl.txt
  % and version 1.3c or later is part of all distributions of LaTeX
  % version 2008 or later.
  %
  % This work has the LPPL maintenance status `maintained'.
  % 
  % The Current Maintainer of this work is M. Y. Name.
  %
  % This work consists of the files pig.dtx and pig.ins
  % and the derived file pig.sty.

Given such a notice and statement in a file, the conditions
given in this license document would apply, with the `Work' referring
to the three files `pig.dtx', `pig.ins', and `pig.sty' (the last being
generated from `pig.dtx' using `pig.ins'), the `Base Interpreter'
referring to any `LaTeX-Format', and both `Copyright Holder' and
`Current Maintainer' referring to the person `M. Y. Name'.

If you do not want the Maintenance section of LPPL to apply to your
Work, change `maintained' above into `author-maintained'.  
However, we recommend that you use `maintained', as the Maintenance
section was added in order to ensure that your Work remains useful to
the community even when you can no longer maintain and support it
yourself.

Derived Works That Are Not Replacements
---------------------------------------

Several clauses of the LPPL specify means to provide reliability and
stability for the user community. They therefore concern themselves
with the case that a Derived Work is intended to be used as a
(compatible or incompatible) replacement of the original Work. If
this is not the case (e.g., if a few lines of code are reused for a
completely different task), then clauses 6b and 6d shall not apply.


Important Recommendations
-------------------------

 Defining What Constitutes the Work

   The LPPL requires that distributions of the Work contain all the
   files of the Work.  It is therefore important that you provide a
   way for the licensee to determine which files constitute the Work.
   This could, for example, be achieved by explicitly listing all the
   files of the Work near the copyright notice of each file or by
   using a line such as:

    % This work consists of all files listed in manifest.txt.
   
   in that place.  In the absence of an unequivocal list it might be
   impossible for the licensee to determine what is considered by you
   to comprise the Work and, in such a case, the licensee would be
   entitled to make reasonable conjectures as to which files comprise
   the Work.
*/
(function(){
'use strict';
/*!
Copyright 2012--2014 for Latin Modern Math OTF by B. Jackowski, P. Strzelczyk and P. Pianowski (on behalf of TeX users groups). This work is released under the GUST Font License -- see http://tug.org/fonts/licenses/GUST-FONT-LICENSE.txt for details.

Copyright 2003, 2009 B. Jackowski and J. M. Nowacki (on behalf of TeX users groups). This work is released under the GUST Font License --  see http://tug.org/fonts/licenses/GUST-FONT-LICENSE.txt for details.

Copyright 2003--2009 by B. Jackowski and J.M. Nowacki (on behalf of TeX USERS GROUPS).

Rapier math font data, derived from Latin Modern Math 1.959,
text outlines from Latin Modern Mono 2.004, and one arrow hook
from Latin Modern Math Italic 10 Regular 2.003.
Changes: SVG outline conversion, character and MATH data extraction,
optical-form closure and lossless path packing.
Original outlines are unchanged. Hinting and text shaping tables are omitted.
The font authors do not maintain this conversion.
Complete original work: https://mirrors.ctan.org/fonts/lm-math.zip
Mono and hook original work: https://mirrors.ctan.org/fonts/lm.zip
Conversion details: FONT-SOURCE.md.

Complete license: FONT-LICENSE.txt (GUST Font License and LPPL 1.3c).
*/
const MATH_FONT={"units":1000,"xHeight":431,"constants":{"ScriptPercentScaleDown":70,"ScriptScriptPercentScaleDown":50,"DisplayOperatorMinHeight":1300,"MathLeading":154,"AxisHeight":250,"AccentBaseHeight":450,"SubscriptShiftDown":247,"SubscriptTopMax":344,"SubscriptBaselineDropMin":200,"SuperscriptShiftUp":363,"SuperscriptShiftUpCramped":289,"SuperscriptBottomMin":108,"SuperscriptBaselineDropMax":250,"SubSuperscriptGapMin":160,"SuperscriptBottomMaxWithSubscript":344,"SpaceAfterScript":56,"UpperLimitGapMin":200,"UpperLimitBaselineRiseMin":111,"LowerLimitGapMin":167,"LowerLimitBaselineDropMin":600,"StackTopShiftUp":444,"StackTopDisplayStyleShiftUp":677,"StackBottomShiftDown":345,"StackBottomDisplayStyleShiftDown":686,"StackGapMin":120,"StackDisplayStyleGapMin":280,"FractionNumeratorShiftUp":394,"FractionNumeratorDisplayStyleShiftUp":677,"FractionDenominatorShiftDown":345,"FractionDenominatorDisplayStyleShiftDown":686,"FractionNumeratorGapMin":40,"FractionNumDisplayStyleGapMin":120,"FractionRuleThickness":40,"FractionDenominatorGapMin":40,"FractionDenomDisplayStyleGapMin":120,"OverbarVerticalGap":120,"OverbarRuleThickness":40,"OverbarExtraAscender":40,"UnderbarVerticalGap":120,"UnderbarRuleThickness":40,"UnderbarExtraDescender":40,"RadicalVerticalGap":50,"RadicalDisplayStyleVerticalGap":148,"RadicalRuleThickness":40,"RadicalExtraAscender":40,"RadicalKernBeforeDegree":278,"RadicalKernAfterDegree":-556,"RadicalDegreeBottomRaisePercent":60},"minConnectorOverlap":20,"verticalBounds":{"2175":[-193,674],"2176":[-174,693],"2177":[-416,897],"2178":[-397,916],"2190":[-174,674],"2191":[-397,897],"2593":[-243,743],"2594":[-383,883],"2711":[-281,785],"2712":[-455,962],"2713":[-285,781],"2714":[-462,955]},"styledGlyphs":{"monospace":{"223":4741,"33":4742,"34":4743,"35":4744,"36":4745,"37":4746,"38":4747,"39":4748,"40":4749,"41":4750,"42":4751,"43":4752,"44":4753,"45":4754,"46":4755,"47":4756,"58":4757,"59":4758,"60":4759,"61":4760,"62":4761,"63":4762,"64":4763,"91":4764,"92":4765,"93":4766,"94":4767,"95":4768,"96":4769,"123":4770,"124":4771,"125":4772,"126":4773,"9251":4774}},"arrowHook":4775,"textXHeight":530,"textUnits":1000};
{
// The font owns immutable pages and bounded hot records. No document data enters these caches.
const pages=[[16381,"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"],[16377,"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"],[16380,"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"],[16361,"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"],[5797,"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"],[16342,"pXsHYFvlufZzpvbew7Ilech7b0seiUec4dhx4iTOHk7IXiSQDSGEQAaZBBJISAIUCJswL3t3MEuBFii30F5aKPeT3dJ/3H+8R7IdO9De3v+X5SPp6Jzve793P+/3yi2KnChKaCpPL0UpysNonNR/O5/Cm9ywQ9byIacoKhfUFBZVoxqFhXSoLiqsQQ2Kiux0Ny+JkWAgC1kIpohZeex/ld3NiTzHi3QQle+TR/HHzkmIZCAF7OJkNpb1BZAJRJRTPrCOU/EuXpTdUMNpsTqQCskjOe6Mr2R7/u437/iQASIkKxMBsCc62Bi2OGX4lB9s8sl4JydILqjgsFqcSIPslZ1n46vYDX/3m3f9RJaZSJaU8fYQpatEURATD4FX3oz4IOHuGX0Wa8f0VutcdzzvPtW8nsBqFS/wNmJuVhiViJak5EDGNB4L8PKuw7/Vz4z2fmbb/RguYm/73PTghIljTX2e+MKHtLP7PFvVnJlTowKZmXSoyk4vhg4dAubjkWVPMq1pRmzW+9bDz1hFZebdc3ffbot3MxQbX9KTyJhUprpA/LxqztYz5knipQeX4D7dkWCfDRqDzrBwz+7yQ7gJW0pWLs0IZQfqcQv234M/gnE333kch7HuUXxBLJyTvfTacYs0bTiBvphezXP9h/4yzuKBAYDDbrGT0ohqs3NA/Eu/3irKAi40b5+C2Zi9CQ/hyXlrZ2E6mq4VwIKVL+TDiintYMfBTnS1m1CEilcWCNwQPxOaSQ8+oYCxlyQH7uHLxegslGSgGDaNgZNWvjRjz9QrPIFPWKjnDyuuuuEErsOs1Lv3YwuOrMQHmKI/2PLIxZdm9JaWYzkeOL/tddyHjdPam27ctDF1Hi1i+zrxQrF0+47GGfT9kr76CbOWTb5h1h2TrstpcaC7OqWq1HBm+0ywFNxVnOmHEYvrvQmqpB1rtxgqcRfyX8YKnB3btmJp3uxA7bQtmZVtSwouMVvCVYUzp6IZ4XJSgdJQeRuJxG/X6xVjIKZB9JHO1RsObtvickGABINWpYUTd5+oGFItITGOLMiC+M6pvewMKfJP6P9GdubdU/SVTPqk1Wg1dLfACdxv7nqPnQZbfA/9v89Of3oX8ZEToYVWW3FpPBqRxuh7j535zd2kubwADTT0hCRKovDuyRuVMTpojI697PQ7JwVBkIg2mkULESQT/tO732dn+hLK9CP/kjWgy0w1surrWM11aUZ9piXNEshS+2zM8UKIdYnpnkAYYXhSxHCIdTLHiz57lsqSYknVZ6QZWM0uVr0r1aDLsKZYUyMqv505XwyyTiHsTUlHOrwBIT3IupjzBb8tom4RFSsUFH4mXwcVOz4jPjP5zgGLBQ76PCP5Lmni8ZnxGcl3TlitcNLnmcq7FOg5nZpWKdATnMxLMIHOyCIGH14ymimV7roanseIh8SbiY/ShnhwfWZSeYeNzAKDRjLF3/r+IKeIWEjOa4VRK5vjP/3+Zl6EnHlJZc5ozjQf7X3xXNoUbMKh0s6n6/dqTuI0jqkf67pl2p2HsxaQzp3Imf58w43aUyPuO4Y9jh0pz62tnYGJuLIk/KLjKjyFjdiJ68wrMr87bi1BE64LZ75mX41bYsQqhWH0pzBOitU/BsmJ9oF1ZIliPrbseAj1iEbo/qVlAz60Sq7HUB9tkR/EZPp7EBOG/PmwufJSsabW0GNLMZh2IRds0y/fZm0s/aoVeBNfPXaGCfhXHHkSj2D1ItLZEFrc6EJZuKyZOEx84QquXdG+AU9g2p04h9MLb1+5hR1kzzoc9GVh/PsF4qgHf2nd57edeifnfMWGfbgD5x9a8wLewi2byIM15mXUIIZIHkWrRbMp0sQWXOdtozlX5eIxuIT1pT21c8dIxZyJKxQMMHEGjkTrMBJp08+jfQ9eAUvdW92DqTgWat7YoonlYQLayiMUCFHvQw8uPrPr12AinnhiQiIYcMpxUA8FKfZG/x1k7vpUUgDSIlf8yv6no/H0B9AqOI4gO9olL0U3/S1DlxTLPgLBibYH9RRq2N/Yf4v/j0uBZsSboTV/d+7NjzAXU1Nbm9nxiK7J0AAmY98TpJ16Sav4YzJXKcsyP2s3OtBrnJ1jklV01gZidmp8LlmfSXFooqzWO9PaV5zFUpT0msNp48SJWEgOa1PhlMKJ40p7cQhrlwU3ypzMOUl9QiWkHkXBkkaK0s0G9OL+G1/6Al/j5y9WjKRSAjM+8uJn2INxi7PmFiGuZeq2Prq1W5c3JoUowgxEi1LyKNLWWTEJV/XMuwvMRJ6WWcDeQjzj6/3P4HM8/y+h4RHnYmGwtXZTryYf21B7lS4QnoMz5A9ONbz5OI0zC7Et6eOwuJ0fkWsICStkfyXdE7yqzOJGdn+JnGbd7nUb9aeIV+zB37Lxj7GURpaBnxFzZsyicTAT9j6skleZV6gL/Bemb2UBts/qhpiCQi+03Wk5YvuO627e3nBH63VZT/1izku6t4S7juFp4mm0e6ozMn3OwzN7g/cvxwt47eVtb+LncBu9CY8gYe3EuZuamepMb51qLOnZ5mu7D1B43bnEO+gvjhxbcg734+BW3I0NDTvvm8Pkk1UZc2prRqmBhHjO7294BCsxPzx1RueM/Clk/Ezz8CtfYDO6ugs21IN9+U7vegSxXCwfOx3mGposVhjIpXyp1kLuYfeKzvvArKS8LK0ezWNm72/zXwWtafvM9jqbfmy6EY05mRWV+gdWog6eMb6QTqt25YyQb41wdPmouKaFTP7QyDtFs5EynZM7jhhMIyPazWdCHJcIRtJAT9w5MD3uLHIG24odA7fGy4MmFIZMA7fFy0scobaAYt3DnnxgYKTfHviL4qX9ykA0UshMymimESqKncHWIgeN6qDRHYWOUGuJs0kcYT+Kk8OGjttYNT7Clj24BmMKfAWoQnoEZZg5hRQ6tmxDoBu/BqktOdDUcDi862Duk7h6BklW5yZ1IZ+d3gKmf/lAS1lFJKetb7QvEobfkf5/xRYzL+sE2wZWyyaC3Q62h6WzhRTBl2KncWegTM/QQpprN5BULKnELI10b8fThc+CbQGzMUqONoIdYAWshE0HC1HA/g1YHE8aHttFrEcfAqwfBRyfj2AqOF5n7N2+xD8Rv8BzT4Pp6Pn8029TqJhXU9dtX7I0YwIehv9t/xCFYah82T3bFuuycBCbLpC1fb7xwmE0YF5q22pvBkkuPJ38mBLRRYHjhMHMnZLNWHgTfEZHE3thoF/jFYypShau0/jYAwPPhhd3pCznoj+X/yDFFqK4hHgr83ZenMWc7H8vY428StRRylO7GuWItsn7yKNWZzLXXEXB+URM4hNB/MFzxz9zv5x5404cxYNPnmc2xL+JFt0G0YHWgXzFhd6Kwmh/GvPi8UcDitNV7tox/57PwIrZf6BJNM4BU7+MlnsVdUqMuX/JuV+QmcyGYERTvITd8Dq6n24ZoSNckjN2GD2kb9BxNhPL//DcJ7ga7JaxiC9CvI8dH7uZdOTRixFWStmb5CcJUjjLYX8iEzM6aG0q8vULj4xrW7zoBbDdoASHpE+51AOsm41j14FNw6sss2TUctk+cn3tbPGPrjL+LZsHUp2qHEXXElom4bOMTa3zs8rXrn8LbyVXNNCeXPWbW3Fjbt/+aVda71/DJ9fOJ/7FhGscmlUqLmZj8g+xJWCeQZZkPv4ynPW4tyQeKsb9juhLeIyxQVZaWRMqVqaxjJJK9v7AlcNUZg1ROXB4xfDgyQg4Yl5JuWnGD29qkU+R+++iqN8mxRqfU7KrFvYfF16EfYiMe2yNL+D+uHaQDLA6lKxOY+FlClbgh+HXEF5I6CcTpA7ci1Y52vA4ZAfG7cBvmcFSSUbPTrYMyvG2pqvwKzzxWISV/yM51jcsX/Ea2C6wKWw82L30ZJPZRLaP/PaZsrEbvbmTO5RkDmYyxxWYpNbezY3mwqW3l5+TYoW3JsL+QAHaROdtKIo1S0cwnv6OoVkeYhf7Mr6YffWPrrikKy3yUTKpCTiOluHR4/54X9z3wysmjaJpkKLS25U8MEGR7LwDZTTf7TTbRNyuzFd2h8LPxHyS43aU0mh30FiTKPVqHyWQQUFYpCkE/cbL0bZXAQ+a+0/jyYWrryAguwetG5bCXUcOoq0yUkkJ4xglpTpyYNOjFDEP73Me582Uho/tvwFdfpwg/8Nxg36c+xGOcoOuaTmy1bXT2Wfxp9hVbJnZvKzvLB8rlerJ3bRiLcbI0cmcPp8yslSbzWSIXxNfHN/3/85ZturrT9nmeJbeYvXAhdqJyAJdqHi1Cbx4GXfJ4hw/8zENW41zgxZbg7HwP4+mWKt0EZ3E5JM/OvVA6Dg37CxopUkzSzhlQfHJ3N/XJza/FOAMYfbawJXspYE1ljwJ+WDzhybp/xtxZvYvEP2T/Ccp9gtgDioGWnjWP/CN1qMlSO+EbFY72X/8hecHbhoiqF2+gWQ+CddjXZKKJE3DRImD0vij9Ec5+jYwG+X9i+PvDQQsbo7PAFsYrQkgwgW4AonnkDEQ/hEi0rQanlPr+hsGXrC6eM4IP6UXyByYhwrMseHRJ49/RqHu3C0EKO45f+xt8sn/ss8BNu5eVwcl/3uO43k8dXbVVuLwU3K7eLlnkvDqaw+zIOLv/ZOS/pYtYMDHZ+cjtKBwLoxFSdjXvBXN2SWjcnPimYL5CFbYdMun1E6l1RePLdz57bL7mBksBvYTFqVQQDH+SrBG1gF2P9g5FiOnspXwSou+xhp4zv/kM2QGmcx7KQE+6WLZH5zMXVO/6EosRnQqKUy5N4MXlkd+exjsU8TdLHL2KbwMlna/MGauqdJIRpW2D9OxQVpnRwmEXRuHCiuXsyM5gx7OROCzcAbd/uZwMebD1Od7xnMmvHN+08rMl4tObcYpvPjlT1g54rt+yLg2+UBCLQ4o3nzI+Wj/kEYgp2XMhFZEsZtccEfX+K7WVbo6Gip0PhG6lbn3Ft7JKvFZ3IkCuPNku1hD2OlxfKHaOOjZL7n4kWUMvLnr/D0RZoptCUxcgQ3Yt2LzKbA5yGM9+hm8DjqnkrdpiZNnk37dAI4zuJrX1tZ0dj2Cz3DPQ/gAdy07dKrcqepz7QtWGOoMVeNySu2NaMT+hQfvQTVu0V6xYP0KaSfXxtlNlBh5QMOE2WnKrw1OUkpeNDopeKiblsXG7Gx9FH/CmVe7uQQMGekCiNwMCoMfZrD3SvysK9BEypBO/s8u5KiI7fnEyDHwvYcOgoY/hwJF3lagYcd7IN0fSzYdgT9d7RQrkKnoUaDRzzoXDBrc6HkU2/tG+vOQ7cUpgOW+dPo5ev9NCeUa/dp/5PL6ObDsrz9hafgDHn8m9JUcofA2OX4zwb+Z0wQxkQkm7JsTktmhFIsKHVwpvpSjS7mcUvIvJkkn6Ni2/g/Y/gFe54eaLKVmHakgObq9NB0zyNFraRX+8eyLgd8YM7SSl6QjarV+9vbAT/ztFTUHuMtnGjXn4Ly1QpSrBa3zei7SiAzoJBPNW9t/P+vo/4pTC3qSfN0GYjHNu0eZV5Cj65ADd2veTSyj/wrW2f81IVsjBf7LLzsOtcY9jp0Z+ES2yDYvSUA0qr1s5oCazRrQjDp3YODu9HXT7Ce4pHdOFjGHyP3BKSmWsQTZ2uwYuxg/wELsbF7D2IZH+dhnlLPMRYcSoPJyiYc2QTA4vmTzmYUdFmSNmZjozgtN40lmhxQabXI0cxUyDZmVbGe8lvWwAV9Wbe9biH4ut2OVYoG9fLCCFMwqq41OlsceZxPYn0WVrCINduUGp3Lk6A6Tm9s8mtP8yPg6JNxy/F6OdiEtgwKcQ+dR6diMeBa7Oj7HYIdSXcwpUc9UuHeIYphCWfoNMDvSStnj8WfZsR91D/m3QrJjEjvMDseva9+8Ud3AJzC7YjWJV6nYxDIynmWUs/X0uwc+JRPjydbSdERC/0EH2ZDxd3VnFWTU3u8Z+MzgAAcTgkQL+u8rSMYj/lJB8Nz3DeeTpb7kZyZ8/1smKmcyB6t1dKUImRPjb31/s2Q2aC2DpUMFxfJC/KffH5RNRo01UTCMDI0uSt9/wYSRCPX89/XnRn52c8pDijezyfTf4cyNFzA5XsSk7PCe9FG14rJgRSstzmfT6ThB4JTwIii202C8eftWt1uhDkaNWkMj33ULvsGmohnTCEGmV8xMVJ8urxZJa4pXY32xzkGOTDUTWgKe3ZjU2j5x0sK0uTiHvbOxC7WRYNkQCHZrmnr5ipYFzgYswLqJeGTcYukmaVvtsTHFSyg1u/Pl4u1KhX1y5hx1R8WUOcTozX5zgvLnDo6ZQcGiswWLsKr7bjZTTyFRGEpPlGrQK69/ScnN1Nmp4fiNrNAR3QezAfMHnixp2xrI7154FN/h3VdzhqmXME7YVD0jOzq+cTlmoLWosN2n7JykswvkNnhn2qQ1q8xFmIm20qLxZZ3y2prLCmR2G2m5BYJK0FU/fY1rHK7AQ9PAugh9ne9eRg5tO9fS2inpasmZl6ZnVdHyIyHU4YZbJt1KGBFPfgSmAjO9/trXYH40MJQJyRUlaJRiN8FkxIKBty8thr1Q3Ta1bDkJ5r1XoNSxDK++9hV2YubYkoZd6ZdIC0NwBGvnzsidqqysrHBCaZe0jjBQu3hVzcyc2ISmFSTU7pTYDGeQVC9cMqLGQOsyiRplXTrB1PyLx2DDQnTU5bfXziPJtMVjecQjksvry1+mNfwbnlTwLpjv/Zf+oNQpZ35uVTSW/VHPan5SMpbCi52l9CU2r/hEEpfEJvxQbG0f13QFbsK9V+CD398evSN+C2Y4KIRHv5InU4o2ebhqGT/6VeyPX+PhefOm0/wBBAwuVdiDYuSnZVWgBoHIZdXbEYIKuRqUrLlHN6VzStMUORdPY+9e3IqevPEl2Z6UcCOaEfWOj2VtCtZPRQcOvr6SVvIt3u2j/KHF17e46oqq9QTQizEVBr5enR1DA9lMQSgyqbJLysQzuPFG3Ib21Pbigraxbdp0KGmkzDlUGgel7EGvK40ytkxjYIigcq4+pdjkyq/swAPAm5SOVPANgRKzu6BKqXvjDa+YrE4t37/wFbyFvX1YhlkT2qfLGy/gCyxNqgif1JVL0VngpNgSopKrYwdwAbFomy/UGFmPe9CzKbWVi785wipSB/n8O/kLKbZbychmsp1498CandgO53KsZf86fEXJkFomfPUuqLSYFP+OZTkowFp1mB/PHrz0U7kFLYIAxcFDA7WKuKS4e/LeKnXFsGorPOj/mtU7orfBSsT0Z2GG5f4ddEc+Sr0BdcRP+XdZmBBbJcJZKMWSNZXrKFXeuvPaZGweBmkjGKCEFoW8cZSRjl/GDGwjJ2r0pCvqA1fZzdv7usUcPlYteWjMVmwRfXw0k7M7yDSzfC6TgWUzof/dH+HPr+VPh/jz9s5Vt33QvZqMKyOoykD0Y7kGNVzeJeYMXTjw1Y8M9Ll8dHj9PxTcPyPC4Hjfg0ecM3AIs6dWbnmfZQ/NEc/6LwjzP79iUZLMf1a7/v/IscHbmbmQHHtpMYVWU0NKN+ZhurWQYrjfETEs8vIaqBBQWRb6Uim5zycCXGk286FKd4CiZL7KuCbNi/T20eQKyYDw0uu/pYAwpScr9zpFIAdg1KGn/8nBub+QfzdM3TyrNrV7+YlEhAiIg5Vcxt10zxFyB+Mj5V0UGXhE2Ns1fQtq+nAYmx+qGow84mjRr8kdf9FT1bn9NLnG916iRIW848tvfY196JqWV0NwbGhy96AvqA9X5hZ6fPXls4mTVz9KCfF3++4+CgqkD+CKaZfWdanwIaEhWjOVrm7d7Zv6Kcv4Ad8v951sLF7vfvSEshdD5ihxWS6yqcqclDzK3Ercq35sA2hopmW1dS53Y8NE8xTzauduL6GflrKuC/gU2sfEKE+pBwaxz0+T0EfZI/a4JJXNopLGV3UqvRcCxu/GajSnVVbkNpRW6W725anOp+IgFjd3nCTFbl2XcZ/k5dS2IczjSmIeLXg+M1MkktMzp0+ZyeUQa2Zd357MQ5QIkixyidK64pU4Ujt+HC0dTyAUr2MFMZbPdhZz52o/fEWVe1+8Ekx6xtVGWWHVgbbhGDv0MhRo479i5cOBdj0emLvnEJGnmoOl8Z8o35xSdrweYbWkUxdZA9ZgelXN1sdGwhVOHIYr+UI1l48H5Gg758wn2GARVCrHz+KG38ZjOm8CrJRNIvbHPpHK0cHXitHtUOu8UVYU/1DvEzVeYqvaqrYzZ/w2a0Fo2iiscinT50ZjlVyalKKbHG3j8sIEKnUQNJ6LcdNr8ZjKndiir5hECC/2jlSLamXSdqQJdo9W56w1ZtzPBp6LZ2qUHFA9eN0nEo21CG7JXc/08Q+0PtmkECbqtf6fxlt+Hm9VO5JnZCL1T/Ez6Yti3sPcYGlGvIwrgwsYdNPLERbza5iPLaubMGFBUVmsrSswh4+VCrWE8mpxhejhozmC2YNUpNo8Gt2Wkyd/alGAgB6BgDXCxz6SsjFbadfYB56bs+l1Zpm9CcLstXPXXylkI1omxvgyPE88kQ1eyhfyapo233ziDbPDm0pssVhSyjly4BWYxK26XIDc8HbzCDHGuLSg0hTCCRrXW+x/fhbPUdkFNXGqrJ2yxUtinKdAzmZWF/9j8ZW5Kyv3JqNaRnpMbVa2Issy0vIpFcn10BpndLcuIofYta5oHVvT31e2vY8/zYHLERbdiFm/Yd+IIJ8jQRJo1cxMWR7ncPQsB5n8twIIiciQlQYC5pg0xO5LB4myeK2BMPfKBaS+IjbMnbU75/qcebOwgT4tXbXgOHkDrZYOievew8UlOBQXsH7lymNkhBoNHQxajZGi7qqVWE/fHHpiyfuJewKDO13f3zyy+eH7g5daHSZdouOH9KxKUHD44tL3Lp9nPpYoFMzrvT57d/bc3sSsS1bOH03P+3hiKQ4rK1q1KrmGKu5S0xFN5AvN77yidjH57epQc6Q6FA11kNxKTbm2LFuWI+hb3uMPLuhaVteHyagJtmTVBGPByShBmTnPHrFHnCF/KGlOosQ5x/ffwAU4s4uSYEnDBSf2n0ZjRbiMMvmK9GniiPaZoedoVPDkNs949DdFuEWauuiPIIHr9k84Inth1hktFPwMBph8/+o697NEV9TDz/3KlkV+yWAmJKE3wpzJ9Pq6r0w3e9Y24iucDThq5XX8YJ3tUs/C8AepFHuXrN9DTnHJ9CXTcDx81HGUNdSxVqlIKKH1flzw7TPkzvsaI3MlqHgVMSk7mw7FOdnK1zk5dLhw7LpHiJi9CZiCYrlYLmS1tazFuta/Wru2Oj3qbqUwtH88TbJ2+ux1eB5v1rhPXLt8644LOIGaJ+zJILJ7T88hTEFjm9KJsLFsI9rQ4KoJPj/k0/hLZQGin0vCg0v7GJTnKqf/bpmglv2tlvXGC/6TOsGCeCXLqmWT8lrPsatr2ea7/lHN4CzbXse2nc9rY111LJc1xKHUD+b8PYRx88pZ62OHcyZfi81484NZUyN762o3UITYUHfz9YQVlqbkLC4VLEEKh9khAgNWlBDkxtZN607iIVxzEKdxcFXvhuih7I5rCGe88cveaVk31tatp7C5vvbgbtRjSSC7r0y0hsiT5QTdSrtHsYpOb7lq7Sk8jGtvdiCmzSQ9QXYT9uCx8OQ8Wn1bVV8yHP3wKfn9Hq/NfuR4RVPaNEoW5qROqxx79Kjd7vf6/Cl+j8dmO3JkTMWU0GzMxtRgY/mx4za7x5vi8/n8Prvt6JHyMUGl6jw7NLWi8cgxm83n8fsCPq/Xbj96dGz5tCANiWmhporjR+w2r8eBvKA4BgQd1tFa79SuuxZNSFfHhBE72oR3xIyz9aemHph2oOG2zLPk6lVqimAqqAROVXv/3JM7dggCp0k0Qkkit/OaeSfr7uVVaolAhh5qdUxM7l0ODikBgpYTd+yce6r2AqdWiSqCtFCpoBPS72y4dfr+nv31J8N3CtCpVXqI5MtlXl1337xTO69VCq03DIIKfigvGkKwiZLDqKSPsJDOksop5RTKKeDDN7/D6xcmbyULb7NF8jsFXSWFscYyTyYhvYI0Or1xZfcRQqF/XoxPvhyJej+XPx8e9ASbMEvZJe6M5w5/uyhJ02haRkOPVp0KHK8S6/2ddOY9fLIa7/yDOZ4Ycd6fXKvEnv0dnjkx6yjpaQWqLBZVqtJdGjanhHT3cmHWm75O/PsPCV5dThTZqDZl6ySu2JAl8BG+ynmttl3fjnaY0dSIMSDltaDZul5daOyV6/lqB5+lztBm6KvN2YTGhUoKmx49Ae0c1Jhz9DJfYoyIQrGUpSn2HSRfeQVY1MnmWp/jfbzOCTfloKJXv0heJvapt2vfxotYAaPvgKZAyhEqnFxElanJ1NWYctACsarvv0J7nXGs7Nc3GSejisJNwxgKBfkSQcgsdbWx2dipreRL/xnauVrDGMmnazR0EABtzlM5SQvUJfAjoqoxtBi6NFVc2eV0nuYpJ9TYKQtwa21CviFdK4AXJJu6SltgCFJaUZVbWUBuMDMXebCofST2OrINlYsPSdl6j+w2+WEHBRATBLVsoIRBI9iENmtYJ4ETZbuqUpNvDJFOjnxYVX6eU9dC5tRuLijn6PySw5xK6mK2NYl8MswN90EmW6n/yrLwm/cS/SDj2Mz9zKzpT6HzGRHKIZV06K+r9v115egTi5SmZxsMlRhHmpAqkap5A7omWnad0DSqo0aRyth8f/5QLaAws7hNXbv4SHA+7gfWYQE2OwOBnO2PGp/CiSLOrTTCuUA5XjgVnfjoFw+FUxsrsQVrG04yP36JB5e5E7VY6d9Zk0rvcKYQng8rraIus8NqYA1MCIiJnQAJ6eH0MLlsh0Ol+3fWGArTl6LVaHbewzGnyJyCaGauFOYJFHDDzcRSagAYP7dHAaqBoL08LWwMYjwychevTksBJsybTuwuSQnZKlLTDSFMQGbevZyl0hpItCOJUq7wwK7ZV2Ibti0Q7ssVPzq84yhOYd/1AjQyp2R7eo60UC3xSlKoo+NeTLEpO4FdhDBvRLedGMl3CggFQ8UEAFKU7vfciC+PDDmUVpCUXLJiPWd5ZDkOLHmpHZMsJILO5yg585SWfQxG6bKY7KIiDlCczYcuqHEtZ8VqKWASuaeY3uqW1TnDNUNJdqdoNbZga2VWPRnG4gLMQsSe7k8LZUYCBe7ZPdHOuRQqeuf07MQiLJ00WK32+FnGRyzjY4+P+DrlJI/+v+Eo9+PdJNwQelCcXaKtpNJzO5uL55Kb3Owv9/0LrI24J9nOYWl8FvfGI8l2judZHiLr01hqoqlkdXSmF37OC3ZyYL5vYnXlTYjm8ZPFyVCaifjCIsp6zOC13uPscdbF/qj4xl2I9v/JrCQgrPbX8TVdHMqR+gAXVIcQUotKysF7IGwirXPpHXqXWaPsIzvJssmWtEqPh6Sj7FXF24xQOUyShszR4kaZ08w7ebvVbVenEYIqSTHayMgMLsnHuVVeZQvQpumETlTJiG+Ulfikh1ZQS4hfKVFQfIhDldNuVhJ4G8k4aCgsFVYkmMdxIzdXkh9+2BcQX8Q2srysMjaR6djhf9QjEE99ZH9e8fUr2FuXegViyb2yhKEkq+/qhU8c23fjT7P9e16C0mamLQxsm/bsqP3n6jPPTR+36RGTI+K74cWu6o2ND4NtBYuxSd6k7cTfGNA1Lyi9VkE7a+TXF5yac/xo2z48hVWrh5oXFwsfrr6zZ8ve8QfJpK+umLog/vqAft0t2g9X/IjiDOYVirpUp5xki/GbwbVHPn4T/ijuTzYh+aJv4CP2l6S6fMEKkHdlGktR1CX+34Pktla6p9iDJBuljWk8awa7CPYIm8Dq2VLSlpDcbp7n9BK263e+wuENvtyZzS83p/RQxvveGrBVYNN+9avPi8+4XLeMWXuuB4G7eGTIHqU0qXdSjAghYlOQevhng83eRg7Jd8qr0meLTzjCVWmyV+03WhMiN6h9ag/5LKW8nKryqHwGnUFBSEYV6Q7SZ45qX75UzRms7HMqTWrKwt7ZW8gDsyDAXo6XDFb1P19/3yfowerUxVdXz9tUs4Oytf29lB38YA+npGGOvw19WNWJB+ayKfjzFryA258qvB5nsXVy0YKNd54y1eF36P78OU6vljiCqiaKi4O/bcCOtWsPkk/oGEtp4oru21i3HoXIskZlB0wTuGRhl0vWdZWDlJpzzdz4iktl1bju4p60rONr2Jc/ktWMrRlUzyHtfHX59eOrrv86w73r3/ID4wNT8We88IGyf3J68u4V47d8ZLBlum74tsDT7uvGd3jxzQ941sbWCYYcEw7Cx03NbQzmF2aMwRIUTviQR7o4p6IlkJYTaaJ8piIrUMxa2fpwnTQ2Nprv/zTDyd2P6djdum7b9FvwJV57LVE2tL36xh9wBtvnNa2Zfujm6OYEMx24a3VfhAxsvormLptDuW8zDly3bmSCelkrN6GTekaLXfZoyfTNhPiOH7z+NdyKR+bjDaY5GT01nAC+KjtJGdOlgRX46owzonSxRwme7Gi++hGThTMkOrths3Lf2SYzAe/QkNc0jqfV5YvhkFPMtKMIean+LASR4SIg2dHeugEX8OjhSy2eyZpQAu5x0vTSLUjRuyri2QO/NqVL5kKlYVxlyYrbBu7NXbjcshA97XI3307O8QA3S5q+GlkllDToRVk2L/02fngzy9K7yE0ChWsp1PWwbvXs9TWSgJO5hUrlJL+IIuepvCLFjgoKn+Yhe7gg5eGuxI9i7EIE6bDLNqwsE3jyrRP0FJx2TiR5SSi0kS3SPDz/sqTYovKzFRLXOyKNtU4cakUSRljXkIVNa23rIZ1J+QQ3xZewY/13aNwm3gXWG51ZhLECwv170MMdKW02OTw6H3LM7jzK3WKFRVElpSxHLaZOaJ1GUqq5D2v6X4Y9Lg9cBNQWpU/KCrUV1v5fYY58Y1mD2e7We/kMR0oKMbuxJL+BYHV6mXuw3FJuqycsD0cDKhiQ52xQQL29Hrn/i1fKmIq3kBJORlb8CR3/Dw+jRjJwWSrwyg9IFCYhxoPnf7ji5D5+csWzOsf2UhaS/w4Oxlezi/2nVE6b1gM2t3VOAZoEpPYfQa+wMrvWYLEZHCq32+xV6p6FRfWIojCfDjO6xs3EbQh9jVV8/8y4c2C12qO3BQjqkkI6+/+CFv3SSI3eajXa1R6HLkgKFi3KjZH+h6p2KZUwrUKvoEksR9QoW9i8FthNX6l+sFA19ghwqjR61IsUpUinOYmMqIaMEcsuX+jwOiWsmt12BV6CgU1ER7ySfdl/1OA0ybTOXT0NNVgkI6v/JHo1x3odVq9R6TSZUF3USJE0t5aSq8XzJi7CeRR9jM18/6R43cAYa9gdzqSYITrh7f8KM62npjkdLo3S5lyeOaYbk5FTd1NibUp/u6J+ivFpKQ8ATx9G7el/ftMf/gxWiEcoKcrdfZbjczPrK67svh3/hls+wTf4bN/vvwMrwqOsypt3/Z08l5fRUL5xyh34Gid+/XserZ5cF2k555ghVuY/4GM3VU146gTTvht727niBV+Zw/fKvZQDRo2kX5lt0+qWFM0pM4peq2R1jPhlEBN/9i5LJVSGTz6YffXqza/9ki0E8+HDN8AMYMLP32FpSkfRr385Z/Oaq1//gC1S9rx/9eZBHr5SrY1WaHL9vnufuUoqQhOsGQf5m0zVciEaYcoksflLCAdpYXXvJY1UcQbJJGS6lMKzSVMoZ4sanVIPTbOpKcho7QFtJlKMlBWpeJ3SSyFYiXf2oCZM3M3VKyJX80bZLGa44YFk1hYRSNTqlWJrql1F6Z/GlqLJQMBAGqjm9EqXhWhRXF9Im04iy9PdxNPMqnypM7OIJ1jigbpA7soo5Fb9I1Rsllp6KMZVGlpt9eROMwQxZp6lzdNWWBdQ9tWW4S8k3JnrIJUZY+3R14sp9ivEaL6o4sfZe925cipFZUn5GZNJbp5OnrbK2GaPmZ18SBQoP/cs96ykdc0HuymdnVOX8i5ZEyK2uUnB5JJM9iLYdnJvVs8qzwrohYKQ4ORipjZblaEI0yG3ENJ0ugQ9pSGymKLScBpOxcGjCetLeFPiV2mTx0dryII8vPJzTrUBellQpfNqj2hTW6VUtUzW50TQqmx0aMmZmuAzjbVqeT2vJl5p03XFnDnhUlxpso6UqYGe0KqM0EmiOsypvIJdZZFbLD6ziS5yWu4hvxEg6CFDKark6zKNRh4qTimHizy55lGIVdlvFsiwBU6r5XIMpTQTz2kJF6elkrj8Jp+RaPMaMzQF+iyDgYOa5xIDc0kvN/xQNsdEchkirzHwGcYcXVjrNSh917a0FpEXL4O+VeUk+PgWVgnWeQ5sjNKEv+waNsuSRgEOwfgnlDmWV1HORNDL/9fYg3+Njj6x00uvJylTTlO7SeciJr3ZyDn5PHqfqVMK26kqF/Exy6wzGXgHl0vvM/S3E8Ve0mkJ7ry8VItsESn/g4E7LZA5Cm5aLvFJDXhIa2W4cslaLE4xRevWmmSK1J4ivtTcHlyfT7Gd12t4sjqtWlZLklZHxqVRQ7mZJ/cJs0OjIm2wKfywOoSAxqUxJ0B6IVdmGhfaUEAwgdNpOeU2laSSZXKoNJiKzJD+JaVPyqlVIItdOCfAHnAIXKqzxkgssKU4RT7NUW24S1AuVn7tKXBeSg8NtHouaAhqJ6gzVQbSs/LMAgI2yCtHjDy2Wg6aZ1iKuBBpl+iWygw2vYFmVwgmbGxVfggk8h6JKOItHK/nDGqv4CEmqHDW0WL/PcmXVyV+swbR/bFnG9kK6YDgVXs4I6+jLwUdn6pVC0qDl2y5V4DXFY7Q0CLvV+skI4VE3gqN6IdWo9TqJVo6vbgVd0HvVG7eRxObeCX2kIEpihSBK51UxGUOKT/61ggeSS+qFD9rIRzno9hjpXtlEgK9uBTHRe/ULs4PDWdWJKMWtJyLMpwUOLOeFuBz+1PoEhXprVF2CW5FVDqJ/JKsdCCOfNA4skdyK1PxBCDtklOykGRS4PYRMDVqTMpvT40U8AyClbcpAtPL5CEJpWpGjUPrkryyS4EhHK3JJmfr00xKL6rJ+X8B"],[16287,"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"],[16247,"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"],[16245,"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"],[16199,"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"],[16356,"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"],[16247,"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"],[16246,"vXsHlJvVte7+q3rvXSONNCNpikbTNL33cZnx2MZtcO+94YZjG3ewjQ22wYDBgE0JBIKNybsQTELeCwRCEkhCAik8EsKF3NwcaXjrvWTdvPX2keQZTbGBm7vewHhJGun8u3z729/+z9EgzzN8+nfkh+EFsJvkJpAAAxxDdAoH42egEvy5oAUz5IKdW0XedDmbClYAWQXvkx4gOUCE70y7BMdh+WSvu3fVfnxjN1SHw52xqfbVIAenC3RA15TJOA44RUnew4V5JfiKRQrN4OadUifJHRqUOkGsTpnBZswRQOvJ1YECOEGlWbXhgcgDcAJKp8JGCEqbzf23HIR9ygHn09XOjdAIm9f0PgZkOxANkQFpg0/O7SVWKIOj7LaizUVT+//GwrKfwSGYe+p4ha+p3QFmHn1SeHakL8iORILJeirA0mXVO2EerAu0rSvsUkwK/OL1AOQAVIHfB174ztnkIk5nul3m4GSeOQ0QAI2oEmPWYBnEobbYWwJ9UNcBPbBqY+lyOAPL79XaZ+wvImrRtzqx+vMghhSqITcHl/x9M9kh5gJv1NutZho20HNWWbHFXwrlUBP1xKAf6ju7r2cqK2WNpdYQ5IFfZ3M53E1lW4BsgJ/Q1Jjgzy/MegaWw9T8XHPgtKpKVdNWOa2tCRcsBj+USqvDfDNIoSAn2gRN0FMJc+CO5yXH4QqQ3HAtgV8mF0u9oPyFBlI/tmXAAifX+xVsWTVYQRbC51Kl1qRSeY0KCWhALNs6Ytno33Q4U2CwgAoktobfrjF48JEBIAwF5gqlN7hw7uewHr5zf/QERGA7HNp5MBGmuMBrfxkuSfHQSUYiuPA9xcFQNShhNjjXbyOfy4PAu/O9BYsPX0I4RA2wADbN/CywwFQuqDDsmzY3rIWfw2Li/YWC+sigdSYHmsVwrAhGsNsnj434GD/qfrbEE0IvFCIEoUhfEN12kKyU20Ur6GHlsu6d8BNYQhzokMONr1hBDVJ7/btLvWFcXSkgZAp1keLbDpAVMptgwVVXLO/aBT+FpcRJLcKA01JJWYTIRG+t9t9rQJ8j4zDeEgABGBa9lQO+EexxaU0AXCB34+saRuQ0wLJSpajEOKk5Oac3asxoNsebbfhZg4BLC6yMxwj7ZCDyWhqB46NJYcJUZgLgB46T+TVVxU8tAQ8Y9FALRj6oLBLN6KUann7Te0JtVEe9a1eeu2/AWovxUVsAFqkCU6AEIr7iZnxlpZ1SR1PtdEz4mplbNhhMt87pCb2WNN408bjSDRKfC9V6Z/1csjvIfcuCa6pAEEyCDRcwwN5dPfvhDegm8f5x/Hdj8su6lmZIJ5g4HTjgjv0NW5Hn4uGCzuhk52rMwDieC5yNFJdjMjRGBF6+aBSHee6FcSFOWTBiUfbfR4Gt6berRoqmyBgzxrz9I0VTCGfh9DcFu6q+J9wRXoTWhOAkHDvrWLymbBV0QWUo0lEyxbYKZGkwmrH45XKeB14Zy3+woKAM3KA1ID3kSDyGKZHLHSRPcMgCeL2Qt7AeicQ6V10b/0hqj73Di6wyPru5Il7Q7Bu4XliFqiqJaxa5TVFimnb9Qz6o17tbteHZ5KixX3Tz8nC8rHVw/l3XP7MBi3HRuGLcx9wsPF8vKv9/YzCxPx9iPcg9AraDgRK8qEzhlCKfT4v+RAVShUtr5VQyK4vFrnNgGTvAyvE2i6j2YVUV1S8dU4rDjwQg4ksDF+EYLJvkcfWsvgMT3gVVodCNHXykKD9GOUSCfO/iHBLHZ8lvSxyIV1BwJoxnDtY0Yt6kRZ6ohmaxFtqhV2jFCgjSTuXzsAY0zwM2dgZZ7XY0R1YCWQ2/Ir2+TIYEWNZCBM+kupMLSvpgCxQPYqd17kiI1a2D9fNhF8hXdY51BT8kl9gdWOy3OeqqHN6Wii3j5MV8mBoM23tIg8TFMCrGxHnQ2RwUBzKFTCFgRwaF1OKFVugW27Eue4XOYZtzWF3G5idUgK0deEMfhhqkamsRw6kQQ3oGl8IIqVTglFpYXNXYvvAG0BNgbkf/TlgH8yprGornbnB2ZEBVPMmxCj85LubB+wqiFWlQlYJfMJnmVb6f95ii1DLrOqbyod1q7r8r0Sx1A293F1V3Vy8GTJNJFNaYFAsQ1imubIXe+OyJiANtWrmi/TKKknXcnLZZLZ5NSK81zsoCfzziEw7bamXbTDALmelFUoUI7TJGvK3GcDWydWeVMQ9aaOdfBHvvankbyK8AyHKMZmtORWF+XUWPuk25xjhJjSEFOPcRmtrJVeQ12XQ1GNLSsKsAotCdv3JYOF1XTtc1VKZMc7B5qVw931zXMAmfuQCXC4pm0X4q0f9CPvAYK6VUdCKJohTywMONRE91BwYxpW1cUK7yVEo0ljmqSkkOcJ7bL+dlRJgXefnRDeR9ValhGgJi756mXfDvcJgEd09EGuNIdZQsfSASKU3TdQX4pF7j1IIrRS+o49b5iKSwp6gOLevS2Wbi1RRIdJzfXzypbwlCnFkMRbCj/sH43cYyUY2Et3lT4xp4DxYRD8qyrK7f/LvVRi8+MgJyUqGlUmKZ9rPAOszIH97wbEWk3iJdvbRxwWZFNEtA/0MD9hAjYrQ1aBqYzBKejZksWsxEkVbC49qIXxasRp8Me5ygwOaldHASWhgsbWVUG3CglLG8tsxYHkEs8WbaVyUatVuQSTjKoFopxauoOspMzLWj4nb1ECKhB3qmQAdUhi162eRCsx/Vjavku3VrKhc1lE5Hlc5sRfvKpG7r4tiPnOulbmUMBUqBpyAVQ41t1hLyhKYNbPhfuUjLTVa+fRNcANiB/D1gHZz6tjbfGP3SSCqxzmgkDSWWuknfcy2AafDha6XP4KXnwtz1FS2zIw/CNlhZPff5qWfqiXL3BCya9TRVRNthA3RNt/lLBtYFNwBRwCEiIFVmXbr66t21/dALuX5Ave9Yo+toITmu7R01LUi4hZDn7jTmtmL1pkR1G3TRiluxsm0Hji3dM+y5sWnrAxuBKBGjIo4/WU2s6sUTNX0YWRS1jRC2r9R3txOve1t7fTvGrgjyXR0Gf8t13YQcV701k6eJpAR6kwr3MrDMU5WX/mQamSOL1BULnElVnNP09UC71ugeBq2pVOGZ9MPQBliSBm0MWqXdZZVEOL33CGazks+zNtq9FVhBKWrpgrYGmAlLVnY8Cn8CYj1XT6SvJHk5zjlrh41lR+Uj1UOcjhRNcKAwFLcFCouROSPeQm9xbkluFzwHG74NdeDwoqilVCvanWo1W8vnO1k742SJXllZ7vG8eZY8Rloie7EIHDhL4bDGsmpj5+JutRetK8pxm+ojMX8vfASnCI/5dOZgFlRUEOt0AUPJAQ35sSFe4fW+fY48TloL9v1vI5YZAzf8YQDVOZd5wjKCFtlfgpWG+hN4Djku9YMPBKw1hVbO43IGKSNJv36QSYVhOBQZGZhmUybNpLFirJ5CG8bFxqIS/UDV6sG4nKgDkxCqSk4ZumDDEfAx9MCEYVPpJIV0ZLNarEiRYZws8yHM5sNRBilbKEjNTVqrVCkNo42xcqSWAA6EMvZtEk28W0/KI0wL5DABzmJBOeCx66xI9GViFC6x55giiKVWQIBYRbk8968qFa8aUoG3gnVhNwGmxsg1wVw72KTdqWke3Uo3h5Qfr36ynLRA8j2qqTQalUbIQwYoKUIMNpqxT5oZkjM0axHXlIcFpdFpNEIIA1kSxQwOScl/wOdYPFfh/IWFf3GS6rIrR+3YaVhc9uJzd5JySOj2JZyJYAUQO8wed3+DTVdGCKH85olrdxMGaziJEuM0+QzIWSBrSMWniSiQbiDtCy/9YMZS81JkmYI85Lc2bGG6mrprxHCRzIRV8Jxyb/c3uiMLcXrZFydlv3t+/ey355JaINWw/1n4NlMMkTCanN8IrKiMbiTvslJe3TwmHKjgDpM5j5ATkHw/Ew6dpATzVlIGTmgeFY703xUaSQjjkgpH8rXEt4DcS14NprotS4O7rpBUXr5wbO/PCt8D8ibxDQ2qWSPCn9x7Fxw1zS7fP0W/7GmGG2NHKk5s6kkabenlcEGihWaFsgW+mHXjdLmGuiZM1xf7Y4h1o+8ZElfbzXSMihVSmOEbda7TRLinmNQAeWtXQvzNk2nNLRMM6cWDKE5QMtdOJQOoBGKliPwS7F2qPP+qGt1F+N568m7Gr/PVsJVr1w2Yok3iMrYB34y0qufH+pihSpYf7+SIjyVfy0eH1WRH1R8Xy+AZ9vtMLTQK1UiTRtCa5WppPrqeqthFHvCwHthK/u3dx0FNRaBK0H2ZlytKDU/AS1vJ5xkvDxKAzTbli3w5r+lNOXiGyUJ3tocM89XA/sO59zy66FcHSD4chl/Cr8S75ubbunPUyBaiUx6W5zeTXKlSlNbj5aNBrAKtXqsVY3Qit1htgJQslMBF5rdsC3SILdjDNKAzyFSSVPZp5I7v4iKX/be9KTwFpBLIkjIga+EWLyn64I3W2jfuJodvXirH2eycMaN9HJ/UsS/w6XIwG5yUJCuFcniIuciWQ5VIuQ47rkWikHjwYXaWUdolT68kV6VulnWyXlaKrzZS3Gq1Wn3K96+33kREloWaR9hLTAVUCxWpNqa2SuXyfOz1iAMHNFmQxm3s7oQ6eeb2hOKfW4XYh6pv4BMdtEeCxkwUQ6fJ7Ej5XArfZJ7L+GzABq2xYL4DNN+UrTqtuLI15bOAfY5jLjDpctLoBEppBr3LN1wul5hqqBfimSaCbYg2c2SHHGizYIOzZJlsZH1YU53UJ4SgXozOHmXiiGjA3LgQ68VCBE4wl9k6aBLr0E6sJ4tMIfHTkqOstNIHPsYHnyafjTx7Z90RTNkU6HI6zWX1qAIm18WnwDxY1QOHcP7sF9YCmQsf7Yq9/W/J79vZ9ehGnGe7/z4sjznmy5DJZGLK8Fmt3G0xmnCtSYID5+0A44eLbAlK4eLRUCou4gqAGZIkphxORG+MSaPOnfOfxaROKMYVHGaTcxyaKO9orchkQcpkWWiaSvrJqQ/IlUSkkAuJOolfwzVcz29aJDzOHmV2C2qaW7solftobiMojqnY9fAWLFeDOSFLnEscJlsHogu18ynpgF6r1koLdmeGyAmCmia0VA8ppPBzbPnsct2fgbQgWGpFOwouUIvNOEIszvAVgoXGR+MO4KzYIFTByxifACwQA5n4IH4Lv2q3Hfq4AgNhLtpHgkqnueCDFMEyfFYDHU42tf+GlJQKJTnhRwqNlCcPDS0gs4YGDCktR564sQjwDPU06frQ7hC6rjAoaOUpwGU3mNHhqFgA+zDoR1NBT+m6IOWAwtQtkjYoVxLrUJQlS4duNza4uSjY6YRSkXxt6GkWHZ4+1uEUIGguY3AKBV8MKoRohl7kmaVpa7sBvTSPtIvzw/QycazoP+mSQEJzZKp3L3OEjUCJiL+go7lO4VdEkPi4Co5lQPJeckFSkfzA5uXwLeSe8W17hh7xq86KWgT/kupPE0atFuRxjHWsBMtRSMdLTP5rcu3QdKefxXGsHR1S15LY0H3N+lsQBUX0frpRqZWG/yGCpf4ET7eclC9j7KuXrA8D9lTlqWsG8IkJW8KFDPRZE+yBI/LEwoQewdvdudCz2QXKlTdUKAL88tNdZAEkL38tkXyTrnA9bVl1vJK8Qv6DXAEy41fPmcAtHh1YXNY76JwN6iOJyvRYIuuAPK3N3hCTt9+vhmigpgr+Cnf3YTwU4F6cGmp4mZ43YkjwMia8Eg9qDYJOaROV4T2XbA9j2iQmSUcFX6f/ngyK5OR9cnFLzhvy+S5ohbZrctL1l17uKj5W6ghJSGEybAs+pFYrWUSSBZfFtVSiS4LUIfW+hYONrEItrw9qc5ZAqypjZJMSY8BKzawoOcNcH55uov0wumVUahViFDSRvC1TLCFMeYkP9sjfxilp6z2Tydr5M+itg1+SkrVkAyS7vl4W0sVTkSLCS1g8cSE20ptpbWRnYQf5v2T1QTieB2vAoKmRBUzzZPQu7IckX3MeSC5M/unxTJGMnZP5rP6HQq+YIhunFINm06wjy3/I9wD5M/w3EoEXYVGsLRpaOG2x7hEHURauN2wthHUwfdbr5HaYBreLC3wrfOXVMIglwEqDvBxNBDr1hGgBgsLCyZaQh2kRFeFfrJSqletn75jymukKJNzwIFkKj8Ddi3Y8Wx1QKtgp6jdzn3L7pVW+cp8qFzXu6n33klZ4B16ogV8zKAww9OVunMHp1qM6PpfsYOW8/G5mZAwZQ/48f/0VQZxKafJ/6UrQVVPJJpKjcODgLUlraZSPYI7Nfm1+7ttApMQwZJPY6J1tldCFud4+KocmrSMI9dAqNsJv2N8xzdAuNGOGkDPMqUpRpgluO8oc1oBRYOhWlIhG6Ik8+X+kTpblWSkO/D74zTsQ9bMncZDX4QUq86EAqulNifZHmZGGwGc5MewWM7ybmFLUae47gNx3p3gj3nspMdRBSohjHsmjN6rUTc5NZcItGMtqXivPfzXJT6AS1HopVQlWg/0rKdciTDBGVOghTRL/EnJB4hcsyJ5vXfoZ+TskjDSyxvgfX0vqxzLh7mFHRxQPyw/f1ECGt9gtCOw8IZASPQGgLF+MLN8EXAu9fhlWiRvcnE9I+odCxDYULWBbwcdWi0gLAE6LOT13FOPccQ9GCQuYupSyO1+LhtgZPbZdqYPEhy6oS3lDP9xbQDdla5Mbh07ZfXbnXRhLZHK1US+WfcCMGJxNEyOtaqRHZTp9lh8u8Ase9MOP4u0IW5jqVg0g1GBAUS2Ysf5rJXou8eKQ5Kkh7XLeGuNZVqnMTFCpKaIYytGThzDfLugRXXTrgOYC9RTdu5Vr1DKlhAc6UcZB5ESJtAkgcSj53785pPWxCAnWWpZaU6mWhul5gZHoXMA1Dw1HJ4xrxCkzS3jHD4YeljfoJc2wNYz9L1id2Jp8+r7kA1KM1VTYRlVOuD6pHTpuD2qte1jaMNKx+nxUGx8F4uxXs//IDovdlC7PgwgW3h3M/SzaiEI3Mz8oUG4IYDObrIybsWPuyUWygDBkcafUKDFKc7VsI8bLa9NbMhPIxcwKhUA3bjQUuwGq0CgGYm5sP17GiRjQGsiuhCaxIsFFAqWOiwhgzRjRhIUq5sN+VDeoc8aqG7vJbGFdrA1cfEJJrpJa8tJ0iSA1SCwKVR7mCWPtzjTaS5kVipDP+FaqdCm5l/qR52ysg2VYjZG8mFicEMnzQW++7yrQO2dKI1Zl0b8Mb6pPENQx+jcVSZ9Lq0HMhQSsIggxIbhndAXJRIdbNiAkusjfyHTyH3a2l1GKbrkyH8sqhY90DJ/DGNJxo2SiGAYxhlYaQ1CbyI8ST9xKjtAtNwdjYBzYsG7Y6h7FVleWanVqVJdqOjgUYerSrc6E9WJil5JnEv+a2ONzh32Ps+EUuPRaMbxwWBOyzPDxH5a2tKAH1dLQh1Ug4XSltxKXzIYXT+liL4YR84VTW9HCR2sr9LPNDwLZ9YVnaI7FwDCCjlNJ6IZwgO4PfYEpxUnEqfbtJ5sps5egqGigJz0qNxEb0SleBnL6C+fQjKCXj3+iRrtUwPNKJAUG2GgcPDVovZq2LRs2SI6TcTo6tkqc9WP3RlI3Clto+VbJQqF7+vAjISP2peAtZFDbrI4ZJ9PDUVXeUqiDUEgQ+hqXmJcAuQafkBYgOvjLKzuJFS7Btur2ot4Fjwth+BPMJfntWYcVMkgg8N0dxABLYJ5hWmg9+anUiWlTgl7mLcQQpQ4wRBR5jEImUaQ0rwwiYU7JmJky1sxgC7mV3KPrMM2EGvjzC9uJGcgP4GPSeQcOpbxXqWU4iZxHGxEMEXA67TUrpCZRSgdCHdM+fkvI3tBO79fLZBJh2qQ1fmKDZfA6wA9gav47c+fPuGVzcAcmLApxS0sp9GECC71tg7AQegfwn8PHWj+EBAd/pSHg4Ej7ss11BzvOwFqcxo/CDuMl+0Dt7FHHUEZ2Ym8UbznIpV7ixKnkpmGhtwSywrKAXJgUn6df8OUJaU5DlP0KIdDy/Wo2t/EUPCrd4bwaXjoI+2DXlkGiAvIP9Jc0ARHgtooNhzv2t52B1VlO/40F1xyXIBNkEsm1BWaH5mNiRNLmcvYN69vRh9ayTq3tPxG/B7bAdn/LstI+2aScD/8y/u7sR+sS11R9thOmQpkpp6UcmcAgCmxtGduObb29NNoB02FmG6rSO88X74D7YO3qouoZa6MkzjtnJ5pJOK0uaOe/Pg4Sl/uKeQ8O4kp1NF+NlANaQc3VladS1FZW3Akz4Jb2cNZxMAmjYoQ+Mg0VLxfwr1h1hyQCHVBoNumLg0w1LhD1fTSwLRif23kQXgXf7ZPHbtpRlkgVVBXk+WWyJb1bpJi41+G3OI8RBt46d5bUwnyYrR8Mu7YYu12bFCFN06riWXlT8BMa+AaAkhWNbrUPeaK/IbcG5sGUafjPU4SHx+EckPugmbjfTc6nx8jGnW3jmXForMM4q4r9Wxb0TUEBx+TSwxbAm8tyB+Z/jJgmchKRzkG+vpN56eTBRPBrARSn2VmyADYWGdRECxsRKxXV6rIBMl+0PklWkjBCh6dSd82tv/f0aAIKeuhh5/GGU4DAOUr4GfwokXOdSkaZfWtfH7KcSUl1nWhmpYv/tPhPSh+1EPacrL0TkHOOYJV2QIQK3XrK4dHcrfP7+5HzzQq8tkYwMZJFnyz6REHvPOjgG6dq7spc/0UdCHKHGetfQ7epnTapgI+18vbRu7I0pUfPNj8BpAseI7TvR9KiWg5aX/e5w7UzUO9aPaltBJnE82LiD/47t885gc3EV4TvSmVxAfRMh1nQ1znrNawpss3XTWJXEx+LRt74YxHFPCtBAeKy0d0+OmPawe49dcNjb1ljV3a0CvMONTU14LOAHWpRpctFs+imO9LwL3+1n9ZOjU1tn90Y9W3uX4uXwMHKdcDP7cTiSxVCLyyPw3lYWL75GDwEJ9edWHdgWZ6u2EIl/Neh8rGQ2AzO1fKgdSkvzz3zU8lSG453Gs5Ap2QJvQ9x/9WS40BYWE/Mk8f7OJpQ80Kn+7D9+q3o3Vck1Dx0L9s4IflZ6ricDe55svJe+CMMkuCjE5zsGtXcmAliXRy47dYpYwqqf/4fRwrqdjji+eZDJd/5szgNwXm/8PJjOed/rayBT2AOjkr+NIRaMUvaank4fG8/lnvQhGvrVKUS/ypyTXApChGvLRWBOOq42iJj42TSLfXKfb3L+9fuWv8osra6DikjoGlQlOY9kHNAUWygt5XGfkDqbZ+/8ODuhfd9SS1uvFEIxjmOJXkzJumB09TZB3+hbvhnnb257Xc33J2x/UM18FLpdrgMrRFUjCBT7IIr0BL+rRrc8vI8SVG3XVWFyiIoohc5igIn6wopUO9FwcYvnOgMRuru/b+/vAuL/SLcVtVW2LPwMTF0Y3dwSjGggFOAROL5Q/JhG9PAaoTMXejUhrcbckUvmpbL4mAIQQZ/oUAIorNsJ93PDfEKVsNWMja2lzRPrhzULQTyGvyJtP5PdEG0yFT2MrUqRO8/OVKlpQaBkaBIBeDyCnkzVfBg7J/Aj8xmiQR2euoqm+ILvDuBvAyfpsXEX1/djgFcCoPGgXAHKc9hZoGC8XM4UATA49QZh/fp81nqcZjBCQ3CaHYUjPSFLLOvl+LfTCBlFMAyErSTng62mh3FqFZDavPGqDd2JlrfO2Pwu+xtQqWnp8+zM8/QODgh5NDwMycGHoKdsK503vS6wz9mc1LhD6Bp48LvhgIE/k3QVPa26Db2im5erS7jjbw82Gx0BmNzdz+IC+XL3J5bi4V5qLEzRLi4+kaH2q6QHJgD5A8AhN7v7wqXhF29Ja2yPbpHTLt1WOcquJ8cQHc3QYfV6/TG6XGU0lgHzISZHfjiNeKTPA4bYR9/sHVp2eS1sBwmR6prcqeX9chPGPfql6ixX0hhN0GzcESuN2h0jjwogZY4utIJA5mTl1na6vqjTIlWUVGV0/PQkUp6oNnlxEVSTLk/4SbiqD3T1Bj0Ye4pZcw8gOiJ58WogY5VEk/OHSybcwfhxt/5/82hRBccON52BUg7XCLmjePT9hVmD72+VV6wmrzGq3k9AjkeibZgtpZBzl7MnSICnCvQMWtO1SJ4ArBVhqHTPND7fP6gVI/1s+tY48kJW35w2/ypU1EjsH56DxPXaOl72XMrNhsSIvWy5fiXbXDf+s5VV7jctGI+bQK7Qk0bkY6l51OAkXNVPp8UAyiRFdEjpwhhNfgdNeYgI8i19IsFNqB7JAEneqLBkRyLgQPR7FggixchBej8dK/dWmEpBaNciX8OtIpWfEf/2d38hAdmR0L19jG9DabArD6UCC1hm1Nl18QcmECT/2TTlradXTld8CZgKy2CIG8P3qsuq/8cL5iKXB3URQwNnELXowiV/9qyhOFQaTxE++R7oFiK+B/wze3/vtKpdt40fKiYhsPnsJRrQj3P2qYDStYqslVYijDeDBt3zV/xqG4XkKNwJqE+eIODXuMQ0EQRUJx3251T9qJ+7zDDVPBa52vrw0/bbi14Wp4vz8/35XsLzBUIsCLB5x9bi3AYzhwbeBhl/5JQQ+WsgRPqWUAWwNnPcHBLedBMmQA9ONx/GPES9SPmXJZbNQ2VvwdO0MhCskh5wKILWcoRFyWiJ3d+VBzEzKYGih5YVAWH4PTxaeeRB5fnttdPblnpQn24FM58/iXH2bKAW/5+A1EwknXfvXwdtN0I2m8FZ8vNXw+0U17KWURBW0wmc7dgT213twZLCPPekrOIuQaRnpPk5TybW8TW0iOxlFoWQc9MJKXLJBc5kWwGon0l9j9eTYqUjbdmfXlpovxEIA/oPVdVwNY1Sdgu8zuYDnAxv9apmHJ4/uiVuU/ueHDz0bvprSmayhp6L99S3mEzOSjuvHXejtxKYwd8CieeQ6sjlLXouUqtUa7mWatYL70Pavkwu1QeZt964IGOayc3TT95EkLX9TPL6o39C+di2dRDtavR055TbemFAdhlXzv14ELrjsn8BF8uOnis/TLd3LpITGh7lhLvPX80PhWv73Zg8V5X4nkX7mijx5oNqeNurIg/cmc+lI1S5dN7p/8chysSa28kyquJP1JVvjV93ZFLX59l02fKCwLIBPS4qI01sQwI3k+H3lA0WlAENKGqzatKNg094cgzeY4x9AQAQtJm1lE3O6WNOCzsl1Rg/Tq1aEdB6kYgpRXtK8Sb2BYlAq9B1pCAajqiohRDrlBoNMjGOKWoHd7MhvZ5lp6bS596K4J/qEHXdb8ROEcuByUS+t0S/F/AKMihUcTCak+df+aHj0KjB996bj2pgeQGelQW7UsfeBmgBwIFkjM0h95i83MOJoBtoobaI7FpEIOK9BuTj5CfwzsoHl6Ac0cWf2gnZbHz55/C4SU/Rw23SL0zWYzEQ0aQUhskrAF0jAqzZdAjgnVeJgoH4ZbJhrINIdVM9EsqoftloOKB5WwBN93EaNF4fG6dpQRDpudVZkdnfn7LdHq8Uo5uiayIol/G0jv9gJmRchJRz3H1o50UgJwifXtIFSQ3/eecHEysxFGNvBEe3gMSYEsdWXX6/gOHvl3+QyCbSHBoJd17kbNKFDteIBVxeIRbPWnzdNjyZOaePZ+9vXL9TNvwzlLKXkHi86NqGHqdztcKhUImo0erI1QD2On3fBg5g/gViGtoUrbJdfS7ES30fT4Y+jyXtnq5XORFqf775Gm9F2MkhQIqVCLAcLaSA8S2aQXpA3LHwUT+k/eC0YJOO2SFGA5ZCi6RIpyqy4BXy8PLydOpyUqeXsAPGkYRCZ0sd1yEk9vIF1rWTg+B9RIl9JfAW0wLLX49LWk9H3tmlOPDd9/He86PeH6BTmoKhUqB4EV7g7jUzTwflSyN3JGbKYtH2CtMderYmxl5AQmxgJ7Lb9JBA6tidXsSykfuBa0FZZKFc3AaTsPQvbovczvvRKXrYbhzd0KZcbuCyKGzHF4HP1a3kO36yBm40b6P/p6MkP5WwfeOrVt6f/5ZSLwJ5AD5FMhjQFYR63skCeuBAL9vbThnsFiPgeCNUudsspEiTc1bcYaw4vUwu1K9WkqHMLPOTI8qlAghOMm8yTaxbXwTkkdkGB2DdojjDOxkWCE1egcEQ+Bs1ZZv6zbAPHhIual354BuI8yH5UVk4U9fu/Lk586DdLba9iy8iOO6CcGY50wRrQjK2FryI/qdsb8zWRsrmXxmnmc7P5Y7rx8FFNJWpzeIHmLuZ0uhUiyhh4zGVir+Y2CEdeQXSQ6hp4RaESeS3HR+v+oa2dVOAXcjAD3InkttGpQhs0RTAApgN6HCz4YISm26YjZYcU9CnWRvTyj+K9ckuUMLs7zbmh3OrDOi2dFLb588wFxkS9gqvhghWzjseYESGjktEP/QAmqlB620YelERlWaRolmFkEFH2Uv0aMBTDVH90tiKTMj6EnEAgHWxZKCoX35fJDOgTgCwozhA6ujDrxZDcgpAShMbaxdZqvYBr4SLzKSjc6t3F+Sb+Zd2DTlG5ilLmjyroyjzAHorYp14ZS0qANuhxPnun4HOAL9bnPZOwSSv3TzdOKkfe7jMfuhN4Abw4ytQByDLVoNKuo6SSk90gc5bIgt50NoRCpg/lxEGc9UcHom+WFi3X2J9f88zG7GU18VEjPIUlL/CtmYaMhJnYszpS+pkHuCmaw9yHpxpvIyuUwBjjZqZCK1Xq7EWQ/S+ZsJglRjJ9cSryR6yVZclS8wxu35xm2sFgrY/wc="],[16230,"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"],[16374,"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"],[16366,"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"],[16348,"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"],[16326,"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"],[16352,"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"],[16370,"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"],[16334,"pXsHeBTXufY3bWe2974rrXZX2qK+kla9C0kIISEhBEiAJEAUAQIMpvdiTDGmGGyDiSvuNAOOe2wntnEcG3KvS9xiJ67EufEZ7b3PTfLf58l/ZmZX0mI7N//zz2q2TDvf+c77vd/7nRnl0CRNCCtJMzWo6pEdqB54qgncZu1EpI49r27SWVtgQSs4HJrGOegKqkEt8LtdX2Ux6k0cB0raxQThTvXFnC5oAWFph8l4nQTSQoIZ1EDEf4ECaPzOgR880AiXc+yQDXZIEbfGFzlQYMTvhLgmli7IwK8Z4vfpUDdqtPhOM13oBHoFZgL6/kbL+yXLV/Apv3+Hn2zItUAWrAmCF1QVH/Bdu1Leaf0qC8h1rhRwyjM5BWzXDNFjC5H0ztA6gsx0bG1cpRiEC4Amh9rRbvdt0d6UwJSFPcY7fEP2sNwf0Bk9Ie2kwPNnmFp4BLY3dPTobRSwoAQlo3TXnmG1BAWMPPRqE0dtCQ1RhYAq4KNb6lBjzufbH30x53JWSLEyx3aT//HH6QZYAf321j6HmyQ4UIFKpkqpO8vpgC4Re06IDsCmaWpYTwfEFjaBE/ef0hr78qAE0EOyr2ITksbw61gj+hlTAnlg6peuIbmSFq7B4Gu0TwK7XTvhwsi00C+nbkcUfAPpa7LeeWpkhrR/UHLxuZH2megyaulAGvgS0KaGWejVV3JUYwNphFNQjT91+PUSmMZ2KPG4EniUkR70Y1sNgAwYByQckboUH+HEFzppK7a1rAicEApAMWROR/tHfDcjLUFGgZafzxwpY9p8ilLYGZL2TuLv7X2t40VCtkh+nt3i4w9R3aWQDvVOKAJ1KQAhJ53NsTfoqSUQhl1h7LesWejWkZR1yEQSq8h8bnvWCCHsDcIhYW+wi58Ru6JxkYoFkvcF87ADx31nFDmZ2L5jaZAGgRAaRLtfRDusGO8hOI3NBnkmoSQonRW18k38Sv5us5UiCLU8OwtccLwOFCqPHz2D/vwt+t6U6cHIf9gBOaDIIjWMjlGgzfw9vJ9vtNlIsnNsCMfAIDU+EIJKaJqE1CjQOy+/KLdJX+Usc5acRF2pdQFdE+x0QibIsyk1Lee0aBP/twH0cTxoGiHFpGuZiz7hn+H/rlBoDC3i9XG4EQnYMaoolzMbRjZOBWOauto4EIYpwDtkjSPPx1irnaDYAKWVLjfysAQ92mDqzwbML7ezI8/EaIcD6IbxkSZcm2lAraianAezYZA9XJytlzOMmVCrV4GWUHJyDaYQTsbJFvUMZ22CpWCotd+snjABeCdVjYrc+zuPnocGOGHasI8NqKu51E5okdq2CA0wvjOBZ18EBqZCerOuNfwrFNREE/gnhQNM/Z3oANoDD8LaXrNxLvqjhPmJN9LKFC9UgKGted4CzGToOZiCDn2XZVlxZOEgvrpJo6k2dCqteqseE9cTA430DQtDG9ScWzctq9i0H1ApfLB/Ilo2AfUeOIaqIArryDsaqlKwQSbaoppFOkAGJiMmEAqsxoB7eceDcBWyfu3Y5n8g69HfwA7IS60oN5hpzKsm4Aw0x+myVuRJuKAFVMYDe6IU2H3ovabuPk0loNPQgW43D+h7O9BhdA82tcc2NEs70WZsgCmS1/47S99BMDKDwkBwMpULU/vDPeYB68pjQ0OQCuD4MKcEc7mwpONYn4DBLpG+RoxkGr9U4ppYKJwOJFLPAId06G8z28CdFqnAcbUkt0tCQjwh0aTYA0aRR5DVmmJVCNxwDBCbVo3K0+4N4fbUTdqmBszot/MXpXGJj/Yh/lK/DZpB16xpbgIrDOZ9pCg0TNkBNeDXe9IVWppSYANkJpnnXiOpLqyvwa7TcnYig7Bx6YBIuPr4hDf13gk+h8+sByNRyPrdYCYyaEJjt6rLdnpRUymyF1QvmXNqTQDdcfsf33kBGY5BLaiE7ikoDUuAiiZJGuPXTJB4G1LDR+carzk0HlImI5U2tdeukmkwn+uas8PpmkyuWPOHHCtoRe/owAI2/C4sWvgixznqQdcYkzLQKroowYlS/GS9M6HzLXgD1u8NFBOr+cKfAnAio/864+yuzkXQD4ps4+DNfJEUNfHdj+WBOF4uYaQA5qNvpabj9iR243GlKZJGsthxUqNWq4QUzypAPgZCOpGhMAitGISvjVyU5+vb14IPMrl0F0UyMhb3lCDcBUqjOZ1g2PQTxVvgExi+I/z6nASzxsknwbFcOIAtWeXD4CsKocXIeYR/Sepu6Mbu+qX+ZF3LcPlTMlwvoHmOTBVTBv0ujB5FFgBt0DqQHP0ObUM5KRaZTOia5O+kJd7x1VJk3eD75CG4DTbWztvJvfyIDLMNZpyFtU3ZRdVGN2GaLxlZLxl5kv/+B0NyaV/rXDwkmpB5sTAk/w+7v89LyChQkyT0oavSb5n0gSkd/uXlv3IaR6O7HkebW/yeAt8ZU12BVAPGaLDUm+FVZKrCGAbp1qjINgk1YZk7Be1D6+FmWJU7vV7XYjXVCzAU5Ml3sYXaJsOY0W1oR+O8Yexr9IzApBeybVvWrJqEmVVj5XxOmsTG69p8+UrceiHsmVqYgBXxA3Jj00tvuRnTEDoMg6gj7d7Ukz7UgXbBEHQGu9o60NEkeKdI4GSmoZPZ+bWlvfAWRJFG12aYUoi4z3H7QdaVHs5nfRXJg81wQVrjw+LimHH/B4Rjh2RC9Q3j2ZLo3KbgS2fbtnF+ElNh4Rz6RxeG88xzmbmJlmqyQBCyTihH2eYBT3lWbkl1i3rYXCKfq9dPN87uUE/GCnixY8IKVkHJlFhmsXpGKXfmrqSMrO9ALsCitE6sbxcA0nBVqMS2IrvR6altrlV16BabJulw7zobdW1wC1TlhzN1xrG0IcNpY268n6PkK7pZ8LLIoxf8D0thXCkNpO90thkmijTcjAkruISXh96MTtuH1dwMGPb4FZv8XAYpIzREmAgSKr2g6Qm10q6tzpwKuWD2unZhTnlKoOrmH8aR1FS7xBjz0HXnztkrb4PlwLgsQ5v4nvhuyZK1fFP2e4vKr+H0eRB2PK4sSMr+e3NVY6yphK2wTdARY4JUoDEGTibr0Xtw0JCwf+xUnLw24jM5fG4iyBhognxYJya80avdjwcFEmFnwGMRxaEC2H21eIcWJ/L4Lg0sSCjbH+hHLiuA422aD5+V5lbKT5/JzN78O3vYTGbDdDvWbWwm1m2sSvs5WotOoWNatVxOaOWZgn7srgOZrKzuj0h3EOWaAjYsame48BuWjzqGkxsQge5AW9Bqh43kbs9VjC+9CCy7MMVZcHoOC/lx/B4Kr+ew8Qz+po73UCbmeWkRjqCwzdKRIMaqAq6ITmxMyMfEJ2PoqsRhyvfZMa9oJ2kn1mAnoUK6hd/Ir7fbGTmTqp9ahV3H73LgSlHXomuthFJAtVQvv4Hf4HDIFEdzbfEhlGMnCSWjEijRPg4XNxwW6wAB/DsNr26h+MJHqPHLGh8ABQasCb+rsIXCi8UDyWKmE7SJUKHKMNNpxP0qyKHH8ljw6Ql8C++DAjDr2XTzQsadIo/AQ/BvajN607l6Wt0yQMegHe20rkw9qV45ZVVV74z0E4D+CMO85c7cdLEJgUaD2Mce8Xsa5I2raBmVSCf8axKycRK7fEMF11qDnmJqcEVg6u9ORAw5Kv9x5OCQownHqtivmbYAVwxniiCbCbXzO2NvqrEyJxhlcQke3sZCyJMFp6AIX3cLSmm5S5HCuUgqlZ5GOrljdfzfuPYsphCGHVia3WlYgCzApeII2SxbiHyDyExqPdhPu9h7cZemid3oxp7zwyzx+0zg80iVWkkD2okRISOYffwJgpLReMMuAjg5qegW0SCu8T4Ipmc8dfe+t7HA3fnE1KsEiWDSgRfhbfjt3vQL+skN2GutQYwrW5uprjGlEG4F2+FyFDrM/yLJQ0f4lytQuPvIPmx5YRpTqZwcxaa1puDSwD9av8Qr5mLJy/ICc18Q5gL6Hxr9lZqPD7f0+4XjRH+a+tNhEHiK4il6EA+gsQ8TjNhiLJ5K+DxCjAT+PSkasALFnWQ54N+XdG53vKNE/F2StqSO5bTwmRbkLKHVNjmXh3BxyJUpImv4aMbTKBXSL+PSIHSy9M7dGJ7ZOmNYH4SILLIIjQSF3YHL12O96ZcRrhGfrkKFhcoSXNrPgR5vWzSvqDNtDiax1+9rpeOFwFj7ODsTc0trKhsWagZhJQyGpjVlNveGl2EO/OVJ32OUVibXwecGUHC0QddsGw5jrDLF8vz1/GTcmhe35j9bgXStSPE6xrBLrbAbcuXFyqIXR26LW9MmtkfH3+lxvf1U6i1jl8vVOFq195DzO9eUrc77kh7bTeFqT1lEKNuHtlfdDXvgsH3t7JUzS/c6dzp3wp6W3s7eXe5b4WdwvGLb/PDsstqbYBM847mQ64wTk1B06HB4m0CQKbr4xJMQaWlwMXeMtDBjpI9q6jSckhLcJZYvhnjpYoy/zJgc3fhlBbu43YEpRIC8H8dyEC7nesVWGEw02rgVGvzSSULeI5GOkHdUifZTEkZocWAJV3XjskpoR6IoTmyfhrYxLyagk4wc9878AjdmJE2DpiJ8ZWfPUdPcuhVzuiNcqsuaB8ch5/fH4E24/MWzfcGX4rjBMRMfqTrUfEDu99m3++7fsfxxeACurSkbF5NCVbyAGipvrGxebFoMyAfI/WE58qHU/9QSIk5+bwAO46QL3VHlbtFPwRXpQdtN3UvbKjY4NniOqw4uWVFW4+l8Ra5LAdIDWf42dUvoAFdzm/nkZHmTs8MZ8SpxdbUW+oa+17poS2vQ4TVNUWWVz8pPe6TauJWtXqTY5KwtOGPMV2HXQMvd9JK3u/asZtSU0ujKDk1teKTzzkp9aaCouHyr6f7wTv1O1Z7umShaj1p2HUD0698q0KXnP0/9eu3q94aXr/7lQU8jYbMHKVXUYKtMCSwrqIYXWf3qZk8OdrbaSWLmtxGmFEOWiXIRhN0YyFb5LpZnNZIimBOUhVlhJPAY3L9x8Sm1Waa2wefCzIRM4QrmaXLAFbiQfaHj/ulnkKKp62z/y4Wv51xZHbhOf7X0QvdexJ2dfqBjG/1wypNDDwCWmq/lkiLekADX0UUvzJAx4mSZfGzrY7IPyHtKkiZA4wkjZv6JhPGnWA+/73pspiSJ4htnjFMdUmoWc48kZWO39YI6U1kszyUYgxMN8T5+Ep9rt8r1Aku14JCKHZQuw3lM/QGsGvjbmVXoCnrKZFAZZBaZQ66R61Am+tVN/EOMxKZb6FEaIsbwHM9dGGS6TsOl3eu2r35PthaOwiPKB6e/tazpRfPCwOWG3d37Wzc7iiztapLCQXI0FdLIVMBlHiZixir1Fd3jhSowdHnvyX3Uty33vH6+Yw127b5hnLeQDuYvLEJq65L8vq0XZm7deCbtfkleoHukbshspv5MaMfRl0akwlEnDkklUdZdUrJi+MC+W/ddzU3BsWrBqw+HKItRqMV2pMY1ECcGuQaPXaJi1+NVi7WGMGcjxb5DPEKDv3nweWZ8thPXD8VxJaLDR0tjXAJ1YziTYPafk38SZqqCDt9048zcr1a/+QlmwJtqeuZEZ8+o3gJ/grO/akQzVGVkCRNtEEEWHGVjhiuCYmWpfbPx2GLsasP5lDsk6v1Yol737fkXD2NnMHMMPaaejBmFnW3j6CBRA6UcMO/r7ZrUvCRlpWIWejmJvHvRL9bK17qXNW2dOnGve797r27/rKlTmobcq+WT0XYqwRpCdsG13xrFhpSh5m1dUw58ETZqdKyK87tqPHNcxjvtBqNOTwdkpexXYcMdNr1OayKCbAVnUpvUek7O+JzVqTnkKJQYfuJm2J06OHvZQAFOFfb1xObGqXXTNjg3wAbY4Rrunt9VtsWxwdDFdatb73tY8MpnpAuMlI0xGEtyPdXeXF22vFpdWVCvJ6wKk8psSqVrI/pIWljtV1RxFdGWz7BglsVr4gKMBiceObdI+Ym0ocDbGFELC0sLHnkPPkNIAq44Plj8kuOcc1PybYaxT5Fze6bblsu8YX8W548rAWURWwT5D1ae3J32oHWVa6BxwryOSSudW9NOD209Xow27FZQtJxQUnpWb8XSN8CVOxZmFe8ptHalNTrnYloe3uTYYJpl7xnwo9sOTnDUhnWtmoZwTTSnUF+orMJF8mq/qcfQM8+zGGfCfDZfrc2DGk2VrjXaGs1zub36POEYb+ePWM2YZsx0LEu2V13L1tPFb6xHSpRWitJqUWXLB8g0DSmWcbhyJeTjDV2cVbQnYu1OMjS1ZyCIzDc9EXXeEX41+NKJ17fMcbi92KZFsMabXZC5bGbtndm/MAyoVylPzdqfRdqy9b4aOuJdOlxyV+ED5DC52nLPwPFcxp5j8DskktEMWjEw0GbXLu++sgUZDVUVjbi88JZfx8rBKYa1UhwilTgF58KvHHpUNjGOHfQt9f31PetTNsNm2OsenLmsL3+V++j9I9RoLq0o1FewVbAF9nkW9Qz3R2/5Jp8yE2a8spSaYAiCYgRGxwqdJGS0huRoi8zCWfB3g1CKE/rvcx2YZ4RMwMXRoseSwI0ZoxTKsYnWuImCaEhSK1iVxb+rxLJMNrqbE1WQC3hMYy7xWzruLSvSVBrWlYmzFHEac4hUZxO344G8URSZ4nUuKwoiSbio8aeE+CqIjGMLJi43ipHzxe+QdclB/nFFnt6WC1tzwW2V554eSZVn6qxZlIOwgYNMITM4kww9twGtRv5hOkmGkPTYbyZlF7Wvcv70fYi62LPH4oPp2vq0O5edO1mMTLGPkrgIGWMfLNbJN5gWGNq8W/zzI4fWDz8In8Hho+kXknSuYYptQQXWcWyxOjt9YWi7fnL2x4dOf66cjLbewFjbPjehbuRZlHyjkByLCYbWMJya9MkCsjTOcVxxR/62zNW9DXvhIhyd7Xsw/eJDzyKYmHav71ztZl9tcWU9HoR6zhy0lxDNmgZcu3iObzxwGldBG38oxhXD/rgYr0cd1mWKmxsmtrQfYdfhYuhI46w1645EzwYf9zAexkuZCIWMNv0hhwtTyi0zs0qKOIdKVSQzDsJEoDVV483GLo38aeNvPgMUgMtoUi2axNg7sjJbLAtcu4L75i41mCiDHT7FREcxzJJVmYfdtxcg6uCFL+trUX0c/BXIj3IMKOMTi5gg3LdtX7Vfa5jif0pz7QR0gWbgH2PKW5glUMaRbMKga8G1VwoW0m5sWhRvkZhSyJJJ4FPF516E9DoRBvDhPnxaCxRhHBNxTb49TwCpApAgv8k4iKWpHxbmwRIhyeOT+vHpFN4WT+JtPzInV1vS7p2NhfP3k/O/UpbSxbbs/OL8aerqYmT/pPZdXH482Vh3KLpmq8ZaEJq+nBuAqTBdY1nEeXVBTYqH8shTcDXcbzF0Gjqnm3qxsWlsKkO7uCCpM82aQTdCHmSZvc7+qQ89uTuPHHMNgQNLH+chhThPEIxPZ0ivVBxy0uR0NC4WCHGSjj/zk0ph6c18aXyY1vBlKCJKgqrk2WumBS1F1E3IarKtlnTgTGlK03ozsppR7rKJaMlEtBjBcqQz22+WdFePJKAcq5HLhEpWfBp2PKcsOu5y+ByTj8HHYXv3CXUkYr+cUnYqNDrbFZd8o7HN6MTZxb5XIPONzN/6nqj97O3SV0ceTrLhlZHTzzYWIlnwuUJEq9fcDX3CzKO2iVCyRQ2MygdF7r3pF6ahJ9CX5fa1ybat4xXRHvSS55BpvqU/GG2W6aI5Y7YwEMnHSPvPc3aBCoVJIEpl5atiH/gnV2FKvZSBKc3fxlfE3tW4gH4xffsX2788Gblh3ky8oW38wQ1tYfLrVOR5eAGuMyiXqV91DWvRVnzBoxncmpfUmZAJL+u4tf+gUX1KZfmvkQrnNgV5OpIZl4bCHelzOYDM923HVTe6mQOdBhR24NQ6OcxSgtoI1IgFRXDU3rnzQirD75WVUbhX4kpS2LWx96GOkVXDyOJqYFmojr0H1RxbA6/WgEwGdbF3+BmxtzE0QyLE/G20VArQY+UBA0GfMFd3ES3gG3QOnE1koGBUrAot5Jv5S17hHkFQOmbkQ3whcdqNZFRGtI1fjjbzyxhWrsehHgjjqBv5SDjeEy84GLSRX/Lgj133oWhSJMLXg8j23dmlhbM0M0gVZJB4YIIBTALTYaPx6ORc2/6WJ3AOyhTaTg8TCphCzFGuKPqPc/OQFb7ARevLb34O38Jz7+zPW5ARSsXEoNVkTNxyWgn44mbYBXXH9Az6q756elqfLGMz2STe8CZH3UiNumHEGe+i2J05fLI7+ffP4i2j3gQ//36/0OEzEeBZuK6A9EvUClgBl0i8P+UCsRKWw0X65xFroW0NNioqCzLpz0YgO/LgJOwxn8ZEfZ6eZoIcpmZLem+jYJA0gUOR40bm7dg2oamAKDutavQPpDbKzUocUWaT3oT9SoNNc2XByIdvjTed/7tgmI6kCOZcjD7f0zhWlFH0+HH/3vLMUwvOL7i27vdbAGngz99s+y2gDtiIirEesVu0giDQqGhDC1L9xt8jWEJ5WX7r6Xl+x8yixbV/2APfQJFwn01q8TMGyBzLjAL6A0PnnO7xTUpvwmif37poMOeOaOd82Abvv3foi/+9PfRfhLadEOZ4ExjQQIRQESksP5Am91E+qIWPDR3IQ+nUKiFOzUIFV74JFaNO+Av85tJbEfCaUoyOPo8yVY1/UAwls7AVqeXGUbfH4ZBwTN9Ip+R2IzByo5NfO7JSa6XkmD9E/6KWr5Kg8bUIhO8y7itRvxGBD+FnONSkYaRGPc8AIs98i4N5ADnQyPjI4v8mhS8KSRdFazBXbHkbnof3bvvwUyzXryumomBS5yq3oSLUCsgGl5ACA3DkeYiO+pgSG3O8cQ1R8CysX1U89SAg07Wl98BdcKI3eo6zc1ZhXsykwxm1aiuKoknwB/jwCUB2dBnH03PfY3aTLq1tbOVycCja7FAQ/WUESrLX5Qi5jCAA3Z6ikGOOqoeGR6PxRBXn3HivxiMSfcQbY2vVbrGYEre8WigIziCfEbtPkwK0HP1ypP4a+tVIw79nAqPSe8BNaVKFe+UBrcAwmQbcbbvJ65OFaVJQqayBFKb3Lax2A5s5gNMtJQ/UW+7MAn9lsxyaIZDuzTQIc3lMobI8lJmPNXRZ1vWIS+YUpudZM2kx4GgM6l0sjiI7yGl0M2PXawsZ+5bCg9EkzKKnAfmxqkN6wJRzEckxaWNnXbmKZchzsGF1SddtOEFcXXLyn43VH+GjJ38eUbFKJbZ6ol3mCH0fAR/pTCig133yoI7CoZS5vErK2/FJIFrQMQq5jadif5E7WJNQzSidjJ4nYt8p7aLOkRwaBZJ0VPX/BaEFSM/pFXaX8KCB6bsMFbXpq8iRK0Q5tz8H7n23Z22N1YQrFRZ2Pr3uMahKSjzrN8CeDc9nQlrIo4JDyq0MmPz/iABhsJuBjlIOMDur6HHOEczDcWsVHgY0E5Qzv2D2xolrJyyjQhgZ7YaJebETDVltllZ4HF6dNvSKQq8w2kSzMACDP0dtaDugZXAV3QxoK6A9/4aWo6WAdsAzqO2zCNTgLGmAjspbq9Z449GEoT3/LbQIrQX0XXLaQ39GG+DXaPiNTGiIDhbB3PBAGZT2tcRjcSwgEwgd4OdcGx+IV/kgPzcp592QWEeGhL11o0lYuirz4wcn0saCH2+jm4qnoXGuxFCrk1L6B+OD5x3MDAFQFtSvvfOxop3/H359Dt7t2faOKwfoNjHx/UBOiJwXANy2m8/l3+DzJGte+Yme8Vf4wbGMeG+OA0jOboDeH0qZiNSU1El+W/Jlr6YZS80ToQm+Ma1CHlanVAhlsVGYls89gSagRYBWwHF0jw4bysDl/K82b4zdcr5H1DA4XyY6If5mhPsBdi96lt+EXuW7VAaZMNMuItQIrFJv5TtGzPzIP+sXuqmkMdpS2PwcSv0S9RqsCrVJ9GwOPeqwUQTF3vnRK0lA6aQknSWeRYimjnlZDUrWbEdf8NXoOt+ACZnUxz1/gzkj3Y++6XBycoMwgUzaXLhbptieMbfjjLMJUHmdMKLjGrthOGM7R16LnTU6KPqnmmnkXx1ZojMKvRVHs0C45bonC9JbbCzWwI1WoVpp92kwXU7y41xQ2m5IxeWKU1HgV1cEU2QWzLBtmici8MLVdR8DeuHHHjvh16LnP4FrGyLS2MX5A9dCrKJ2xlUUvHK8E+eebwEd/AANoXmABuE9DGO0B9Btv8PlyXxohEZdTcrqO0n2lnPBApIwiEMTHZ2xEpPfxx2IeGzlY1+nhQlShJJeoCdbqs5ocpqcFrsn5M12BBii1tmBVeYkV3FG7ERNuM3WBqgGnkTTGuPyWIqNBKqs3rdQ9DUsyL2eu/bBefgSUeuQGtCLPxEdh/BI7dGNwqdzfKCP9v31y+dRL8nCBGgy8cE63JMwPAkPzZ5yTuXm9I5ESGcdRS1opZB3vjuFNRdyorb248QMOEJsW1hXbGuCSnjr7d3/DptheiTTtaTV120uTAqkzDvQRHQTIAv8+cnrkRpjtRIioNGQaoiOk8OjXPZhUvJuxWVEcmWB2gSAl1Fin+KxzfCbkggEmzv9HGpH5QkfP5MUK/xGQIuvoJ1oNeC/K2iXGN6nL8kRlvj80PkyOvHMhHhXE0xakzWe+tDgyCBeF+hzGCiAV+K2YomssvNk7LrCKggcF3AmzsLTsREVLkBsWJ+QBANMYDA0j0DvxbY9jtaMHO6RInSsoR80ZkWzY/ejSXyL2sEohCk6Vq337UVyJB9Zrc5jx7WPNQlnRatj38nMnNODpQun0ThQF9+D5vBLMMbNNuxLLkVmwsf8mbMBpyNwmbT8bTQzdsvZIeF56Pitfnrc3Zt4fDCKN5HiDyiMnuJf19hI4caEOFCv5ApTdemoAMXQSfQ/UnzHAa/klAA0VdaUEkBz0Bl0gX+Nkcu1iXLt1Tzh4VMvKkR/9aYDVTYB5aGbg/nxkDJ8Ffn3yfS7bY2jzokTy2i6VxqVeCD4XLSYjxo9BK6uE46Qc2qZHN2C8+v25JDYgXbxc3S45zZcmuDROMcfQqv4xgfQDr63Ki4g4x+jlSn/p9iV8T1Ohib/FH899sb4bklVaHhMnvC/H0WlD0oH564PLgesjM98BoKQ0z71MQJciqwp7OmGUvBJnLq7ACYLz6BiV9bCJE88RzO4ACHSQu29y7OXQTYoaatsxGCTqegcaIMN9vnL/CEMwtDVHPjZmVO7MGeyXCitU8qJa6WcmCvlxJv8UM4RXHqEm74PLsDjJ7GGt8B/6aCVntaEGzYHablSmCeTTQMZATKNzKBxFGJVa2qqopMVQyK3KbWsetLyjRP33GBZHTTqy1I7czNKLamcXKU3JSjFe/j3yP0DT6AUOPJJDjUmfmN/Tgrqgn/NgRHRSvKfm4h+hl7IE56fKoFfPfZviPlxYyyiOEHnUKHUoUPw0EAdPU6BiU3kLbz2BbwBu1+Db0Yu3FC3948XYH3o70+zhbsNIYXdwChEZ+BCmWbOjdwHZxu3DYXrbmBphv/7vwygqbBq8sLqmdMKVmJC3qPaP8eIJb08EZC591UDbMpfgMsuxMHZT9pGuVPSRmI/H4Jvd7/+BkyE2dap03hbsrz4LrlnQfBAXmujTldT2A9HYOlhnC3vHlMGnylBRxtI4daDEhciWkoviH5S9XMSZEqz8ICX3CY8VaWyCLMLCuvRAp5NTtfcuB85YxKOGYFku3ZvpdujobBWw3Cj9BM4vv4SrnqGEdxZgN1cJiiIORLLjRNt4k+B4nRKzZvvPv862oXKbCaZAjQSapS41nSaeRY9OLLjn/kCWdb1v/txtLKsvKzUYpUxOpHEvInUhFE8/uSRc4CIQ4cP4bIRXM8WNJ9suh0WoQZYQMVvR8TPG/1j0Fl4f/I7P4fdUL3cWmmvqRzeg4V4vTs7m/UYMTQSSe3T5BEqhN88iuvU88ChbFzhPzh+/ggP9XwTUjwAD4EBl5a94/e2UOPN+BFkQI2SLP2pVv8XXHyAGcVACnNyJsHzFC7tcFHvdOF6WMepExC4rHdr1V6G2EKW/C0H7jlzcg0ubwmfSgMql5JIEJosTmjSfGXQF4HpB+GcxGirBMyMqrLY3H81jNBjY7bWJflhNNIHYHp6fdO/7gQPHIfmn3NahVZ8+t5Ud4MWY2Df+nVXZajqRm7ARBkeeP8/4BG4vw9OwvKePqQi5hDH82EnbF41sAfnh+2O0p8xKsbkTGit7Pm//RNcgrtuvR7RONVpoAc7rvONdXFKJBOglFSGHVgzq81cNrVyLaYaZBpPVsiI3k8G7gX45pbXrsCXsOjafxcoDSobKEloTNJhVHLSw6yNFmMfnzp1EecvgXf5vyZdE63CevK5334NW2BDWc8tfWBViHMk4H+2gJhA1oIaWeH5AojftSAMcvUB9PI+9DywxLh/72Nkcka3nydlrEwjPK4JDE3fxitJEmiTIL4Y3wSgcgcINIG/69E5dLx6G6e7xoSXFrRytQ/J+V9cR5vUJkZlFrMHxbBKRlk5+xR6WZsjHyc4cFsqN3LxvEyvcgt3QWUqjQnRaN/7qFdjtPhohmNVrCouCZGH/6vCAYpXCuiMWehv1Bo6PtuSKCISSkwChg5on3dCg1KzfJ1ak+ZRapAXvSCIGBw/CQ1GgdlNyTe/lprbN9fnT89IyzCagE7zaHUUrR3VYzKWpGTsjJkm8649fh9Kwx4ErRWrDEmPRXAQGlIeQrrC/Eh+XlEwFM7OSKMphYREw/+JTP4jx6JX6sbJ1SSfqeXa1DfR5bfQc/oMFsdqwjtKmSDH1vF/G/zlxpUrJ2vVWiEjmQ16oWJD3NPbkANtG9FoXKB6Kz7KKIgCPEsCQSbu0KGM8YkBBVCQ52QKhh3dLz766o0/vMS0oPk7Rydp5KyyGhlj76mrZYlpGuRHw68VoG9Bib6BWJamwSNM2HDCjM3kvuDYzVbOz4kolocY9yq+oGPuSok1Pv2sAMmLkHaHxBo7Cpd2K0tZUXwIpxyLMO6KFovf2KfvoBwZRPz2LdOEBuRYw2WGBnrXxzWcWfaQIJU0oohbbW9d5goRTGT88/HhX22Oi5OkVrE4efUTzk9blKK40WLIzlu+Py5uzLKuhLqxiAUkOlclCBiNKGAODnymdOhsYmo2K+12q9YqpmaL6ruC8Y8p6OIPKSqBzwOSlmSkQUMqBDksx7S7Tgl6TLv3FqIKHKXlEBx7sE9TR0khLmfV1YgQUnR9NC2s1FBiirbqGTMb2CSm6AcQ5H2tw8UGc5L/j7RT057YW/SX2PAhgvqRf2Ygb/i/2YxSpldZby83l7qLUqfm13aUtvdunrS+ffv0/Xs+DRUECvIrC0Juq1ukQa1MqWEUrILW0TqZjtPRCpnwlISG0LCc3GBUCGWFmTBq7Uatk7UrC+h8R7ojNawXhqYr2FjS1XD8xNKz6NeT0SR5GpMKqaSZNKu0KqODdeByttCR42gJNkZqKsxen91pTDXatXalXaATWq6ye+k8Ls92wHvQe+AI38X5FSaLzkaIz45c5D9Fpzvv6jox90hJZ0lXW1VGSpYlg9uQIIOkf2WM39/ELq5gKtKyUnMqTeWKPt1iWAyKHK1mT/Ux88mC7YOTKivbjdPkATZkc8qUKlaDZV+KymIw6TibzCYzUTowkRgetEUTzcrJ8fe3Hgh3ckf5PvvitPX5g+7agvrS3OkTJtvnQftiPus5+LLi0V0zmrvnOhYYWuUzAtH0yICtQ0foKlwl3sJwW1Wk4cVcvSw9Ra8otWdqQzAM0ZWWxVuelJmUOlarVBrTjMVyL1EXGRtGmjHPLB1oqswOZBuz2XZ1BzUR0ExGNyO6ZnVNf8P8rE3BoRw6h86CCvyK6sNKv9WW6s/lOg6O9wrxE//4YmghGwKFxa2LdYNwCh4M7V8+c8KEqUV99asyN7rX2wfVC7k+WYdpUk553czh3C1wKxz3bpib4fFkODLq59jV9nJfZVFmfVFHqvCPMU3h7KrsKvMUplM+XzfkGHLdlLGiYjg8paS5pWJOy9KUIWiEOn1Gvj+XqNTW6yekTaouyE0vtheLD99qTXqbwq/zqFwaj9qi1JllQjFvp4x6sx6X+XZ5JhmyucNFLcpW6IG5ril1nXUls+begIAEAJiM44p72oeKGtvD010r/Zvp7aDKU3J7Kw/LHwsdXtVUWtpunCoPED6FWabWaW3CjQyVQWcxKPDYq7IYrypLEU6JZKQMz9jk3QB38+utA/Z5mX3WUl95fmiwY23+KuiYx3dfg/enPHPk6SO7Xv+/"],[16280,"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"],[16365,"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"],[16296,"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"],[16257,"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"],[16321,"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"],[16154,"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"],[16365,"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"],[16355,"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"],[16237,"lXsHeFTXte7a+/QyZ3qvmqaRNCqjjnoHdSFAgABRLIoBAwZs0wyYagw2xr3EPbbjuMYlDk4heXHazXUcx3FNHOfG14lTHG+B8+7L/e69760zAoxL7v2ezjejmTOn7L3Kv/619jpjPEc5/jNvAqzoZPyUPfMLFpmYL7wGy3F7A+aLS1jkVTbTyaQT8Bq8xuQTbJbzVRZeskB8HVbg9iYsECZY+BdTnkwbk49WBDmigQISWCLcTxTQ+rg5Wq1qQGYCb3Nuy99z+oMw8caZL7858bftS94888AbSwbEF2EMtxdhIP/L1A2f3nuI8PTCseMX/sLveEFIFkAYjnfCOomwBGFk3sFHSk9f8/l5nT78fpfEZNhNnq6bewUcD0MBQALCPs5DBiz0VpxGN/3a5Xsm111TdJ3lCyb9yxdsl7f0tF2zT/4OBGCc7ho1DBrgRyhPCc8T8x+Oj+BnKiwpYhf/qIgVwlTR1NiUS1d1FRygS6ogszemOthXWD08VZNlSyaa2emPLYXgBSgHJ3Au91Tf1EtT3VOCpmgK2CERhwh8bLxvg6ARKIESMLx4dypyPggBlf+vCtkAyEAsSsgBaUilLE0RLWCHHFjdxC3SuGGxAIDOC8EgtRt/bGtSgIVAaVSBBWHFOZl+Wqoo1r2X3n0KnoNTO+ew+aSXVT9676twCi69C/ZAaQBvHQEbFdNyNunYCy2wFcZOjB6BeyA8dVFecr+FSdx+Oy25qUnYFDpQPz5+bA10wP3AF4i4ecCcQgBOtENfDnoDIBKFikBcYAWFAgc88DxoRL6x3U9KIYu7qAUMUFW0Nw5QX36S9ENv5Z874+D/dgD1GfiO/wflQAkHHCvtA3dMtILNCnGOuFhpL5XxLAIOO1CYaqMo3FfbehLrmsi0dZK8mfLCIHvs40sP/vLM8KsH2dXyevhnmJQOMe+ZEbbmZ/CQt5JZBjhqGiaexxP8iP+JcOiZqcSZN4NtCSiCm1vBrrmrplJn3njm4Aq5DSaANUmHHmE/PsPji3vkINslL6PnRH/Wcs5+ER6MHhbIYXg4Xl3dMNR3/y03XY1D+M0bLDb1KEx9DV5lCXgLdtYfeeHhbGrfloaFDx8GgUavfnCCHZ4yMpAEaIO7l3y1cUP/NTP3wfXAIn/ZwNpQF2yoGdggHO3c072n9+DCB+BOaE1CBqaMX3XC4rfWpd1EyFiJDzTcQmClhQINGN+vBD/4X6z0G1QstFE/6Lj5wUYyIilx/3bjO8J8gXOCDYbWD1uFd9ugr0ktl59rE/vFBReAACHnPgiHXj0z8stD//u+szLeK7O9krnv9DVnv1+Td/v/we/ri1DhRzqhxtLcOqOVzCGlwjsPX/Sy+3SI+Q6tlr4Nl+D2TVgtH2S+0/7XfPu3cT/mvr56wRE4UoA6gjrIxbgYGVLSM2kpf23xtU+tHssdK3lWeoV5D66RvwUbcPsOrDF1//NvqNckNzQ8NlF9Pz9Js/yabbqLJvn322bTIatuESOBTdpl0Ca3A1EJigLfOCivyu2BLqOYJ0Y6LWdGtda3ODRadHULJTI3q3rY4EXBihZpdeDhb3/PCSlaeTPcaEJBErJS1ZfgDhAqv98GsxT1cXRGtOtB6Kf81+G7ICk/aNu2BQFsyxVb8ehVZy3pM2JCc4YnTu39A3wELz+4iM2c8frjzMe64Q9wag88DnXFEINMBbqyWq2W7UPnbIN9sPaqNVfqR6B7qgYlMSn/Ii+JX0x7wVQtrAltG12z/mrz6BeBD4phtShmXiYGxfBhGxd/lysYJaXEYdMES05Mw0gE6oiuCh4jCfaftm3hqdsGPrcRQitjUhBcPFhs/mghuLbINVO2411xCJ4IoXJDNwT/1gnoGgQqBQpE0GGvDqY5VFCC6IBujNOjwDgKArza2Z/m2876Mn/OmTvZX898tPH1M1e+trGaZy28DX5DqskCqOY2seCZ3ayYxWBsdZy5F5z1aby66dWI46Z7C5uenLKc+b23IQqFEKwBu4BuTc6c0oKEFHF+UkD8UL4xRK8X64FlpU1BOAHgkD1s1+m97Njph5/buEa+G9bCf3ZmSKHICeDRIw6PxpU6/aIJ9x5hFMbBpiJC56qhPVnb2VvpdHgEEHmSyWjhXopYh8ah+YjB64YDpYBo5p2Ne4ftJuwbguwOBRwKqNOy6J/gvyjg42/fePc29kDIi1AD8cdYaNNS6SVYjdtLsFTeyEKvsH9LXfs8XAtHrvkm+4/UKyy4cZn8M1iD289gmYTSegzilLoo+2Hkfz30ThsnXi5DM/QfcfnEdztBKY8IRqdoVET+pdNBU8Sx307S1B4m43wNetsoF6W4e/JTu97rBFXAmZPZULsO79Oh+uvEKuKQiIz6FHBKErWT6hIFg4KVPlJ7xxw82JSHgkYgIERRKKadlIu5IBSiSVuJSKldphKIuCkgEwdFUFCjWTlj1W0Yf4uoruL0ZZh7PmZfGLSvLGUrGfEyL0w1Ti1m/+5zySK40J35VJr9ccrF/ulu2Gfvia6vmnWZ68RuNK2P70yZLKIO3CB5vFOXTz06tW5K8jolAZVbkkUQ/fhL6NZW0VZoHqeZ2Em0JHoLVfuhxPgJmw0LYWmoPdleq4yhSVf6elpqy1xzI4vBdLSx5tFu2v/nTkcUISFqj0EFjJ+P2J+GwxtuvP5lYCl4gAlVb5BWJj7yJnPCy3DjcTTJKnRPKMOZyBW8y4g8BqwHGth8ODI1mNfz23k9/3paz1NDcHUDG8dDngI1zDvlUoNU4Pkx+KiTiNcSIQam1CSeM0N0B0FBmz4JDqrd2D4DjVUURI43A3hjBkrReolGSkjFDDr44jNdMlieNFCHxlOW/2w3o/H0hr6s8tSBP9hfrL2HaygsV1Pmr4L5K7o5jYQcMkiV0c1bKoOndvWOQz+MlxCd2oWkhOG1vOWiQcqDbh4vcGc0cXy1odY3OtyxSpS6nVOzhijuiHCxdmHRDDze9ry4vSAQ4nrOhV0cMM/lBVnBlWllzrlFQ61NdofT5jR6WuLjdAIiQkQI2bsSLVVlc3o2hi4BpsCjjAPmPzPFuw3NBmkDZJnqU/ro0h2NV8MBOBBaNTI+q2LD0PQdLvwTYJGwpLG7pnW+fx7cCnvWJq4XAlwIQuy/4IO9v/4lcqo2ZzrncKt+0a8XoRxLoJPMTNTNcLTKzbASthCYh/4hUcHRu0FaAT3QpbYEeAGFL3kKbAk1ZWuF7j92CIoiKGBCA0pLB9SYiuHpcIeJngKYvsJRWQ1t8tYll0Y8APeB/N64tKwrstVwGCGk9D7n3vttk+GJ41WNylJWOLzousKHkGLhmZyXs1MrDoGT0U2UClIOfjGtdMiddaxcCsvr9a2uWZxkxI90UBfxcA7eqdtVpyGiWyE+EyI6IU8LUMfEDG4m0qEtIPJK4Ebaig5qYvw0EeSpCV0mOCNJFHgX+hIOg8cXUHqWXxDVrdpFEWRe5IHTJeRmEnJJiYgSL+BBVDUn7TQebqcum8uBN9TM+MuJEu427yNSomEQ4DRFQRTSkJLmWR6OBOVEYPRclKXTb3lNch532p+npFbLypmNWg6597fVqp9bqkklVLJdEfRarVLLpiAFbCXdlbzlrzA3hP5tqeZsVl+YzlkHr8LBO3vnFO1P39XFosy28k8IHR0wFpfpZPEKMyh9wZ+Quvt4Zr7v27WLAndla97uZLHrWO0dm5saO9BZa5FmB9c7h5aL8xB5CqHKaa+HJoQ+GwpRVDIlFKAdIpfJBbwmF9jCH95+kq0bY5cELqpduWBwck6DlcX6F3tnOR39VDJ6OxGwm9XBjF0mVEO005y8VS+6o2YZ3ARNNwWmxyM5CRcW/Bz6PATxrt5A0hNCbtKACLHpwpFz5Lw/mJ8EmiQBrbL0Gw9WHMf7nIDVt1ZN7qxeB71QXuSdGR6m66giByOI4B6cgaiap0El3JvMVOKegGRrVwsgCsPPEFZIgyTFW9SibGkLQhpdTJp+SwPkZ2gzeny8ujabbYjPhWqodfqW6zkcZoKcvgqivEYlW2uDtxivN0Jh23sdXVO25vFSJLqDp8rZg0VMiLO/h1mjzh4ZenAD7p71QYYt6GOLZ7BfP4O0TxM9WopYVUEEzFEyhJODykxXXizqVOHtNd14qxK5pCVR6xwBCG8mL8BYz+c0KoTCmJUgQQTit3zvufKZ+M0JSrFSLFbz8TSLCayJcyjFJWXNsAikfiFMLHwhWIQEv4gkiJ+rgQS3EOaShaTZ325rDly8tfcQyn+9sXh0cgFs2vc5SzK1QLjPjiABiO0JMkN4ZCXeP0qdQxh0K0w1ER9ni+49WlygDnr8/ClbWSxbVl+7Zk3EVuxDH7LwVqO5OlqL2Xt6yNoiBMJdi+AIrLukt3f50qJUc/QQ5tMRzjY9hQS0O7l5lBWxjSQM5Z9SWzW9A3Hgjq9yT/sjV1CNos2ZZsU7Y3uuHzwAPwZg9Zs/M5Gzf4TPE55sArM/O/gljJ3HW3ODMEyDy6AP7u/6U98uUeR1zCUj9qzdoeheTKox6SGK8vg9ezayIPP7FtA+GOmAry4c2gK/Ausf0IdKkoLJIgIyOvT1bZVDMEJCS9FI7+v8Y+9Oi0UwdVVVXFeJcdYm2oypWVNZL+bOMNwOj4wPbsX4avtglD/rzeffkaRyqiRzotMWTLtjp8vP3JCqL6xnAmJ+AcgpORxDZIxxHpItj6fYAvbnWavZO+xfnPZogVFj1NUXVkI9RLKZJir2rRLl2oF9L9b3sSZ2SrWGUvhKFDt7YDKJ2fbus6Lizt2fnB/IBcpHLoPZBYdwikB2T6Iwh3v8srVDiiMFGPnnZ5FIjHDGtAYLodVLZtOpGZDwFwTDuZo6ew0chsQKa5NWCxUkSdks9Laxc8evBrgIvORMzYUul4YKj1Ev+giLk5bx6DgEoAvG9cXrZy26PNiHGqso9s2KjJD1HdNjnh41oq+gZEuyzehZMy3CIu6BouMLt5c3r9v/fDs5LSvpFPETJmhhdAyjTk0kUXU+SBIf4U8TMRiQPFD/szijk0+98Ivf2pl6HcnTwP/2T3CPzawosbHSxcez/b4rM95l4cu3XheAfFjl1ha0Ie62wJfBv949dyfiawoZ8hy/M2ZNSnH/Ws9tCwaaGhvQes6i8+g6OgdtJgc1kqUFAQ0+i85qglpEO295v3f4mfStviU9/W2px6/lTrr6Mw88NLy3aH0BD9eU1FonwjbJIRl23koFuWYG2vJyurLCKnMYSIMgeKmmlz9bPglfgorrX+mSMeMKEN0eNjMQkxhgrERyhXMguD8/T6JZ3b0IRFGkHUWhSlcW4pgaymTV2aA3/U7OFzB4wTnUjf58uqAIacnspTWtVSuROQZ9iKcRjM+6p3riACp6m3JX4QN1P7E3cgjoRk11ohqTRp9H1z0RRPZiOrXqt/Skuj10Wfxw363LMATWd1jbBJ+k+yP77y+8Q6vVKgSXNMLkNNqiJ6IbLl/xeRMWat782uXvAAvDw98EZidTZyCKFAOmrSwO1Q6jBTnm1cDU4uhI6SZgB2AvG0ufcwLBf3xRzUI4CL3LOAcG/DYaJ38R705Wh+K+ZFPxANwA8cOiP7Bc+PMzHWjRKLxQN6zql+JUckYEGIGLq6lFDjusAa2OIj8hKuVl7rUOIcBbiEh1GvIhbE9MJI8TXhfDNd7CHN8AQzDs7Dsn17wJkmmBzkT/n7rvvxfos/ZX3e8LzdrFotuoq45WIqatAu1ADeYv+4rRkXyRWFyrPNmhZUsL4mAFCwZu3u4SeOrhOBsxrE1lKR0uhmMDvpVapa/JuUhMc24kYw6nxUB7sFmJYRJxGRMqQ0GONTc+cwYahuThdCoICbkY/AIRvWhoNitaMtfoKdO0gL0vD8jcWZDJM+ua11++gc1Q2bPgQ+GCEAoi2BSavK+I3Yl5NGemCgRTavag93FW0sYs1a/94gSrVyi7VAyG0H1jgPwtzjLQgFwfCSEPMcru9X2dZZ4Ugk69pLDdEi3qIxUWRyg7yXvM+wpGne/57v3l8y/qvMdyOvmUsqt3A/856COfIKAfnaIAB8IFuaqSYBQ64c6fKfqS3aVjK19kx6Zkh4cXOYcUCRom3HOC3csuYe+2Xr706xetWTr5oDgHToJ08JyqkjhKCMmVmUgcGfpj74nS2KXJmWt+yo5OKVY3J/B20elyh8zMTAVw2e5480WmbnqrY2HTzIGFm1NPwXeAHtv9SYTjvgiU1Erxy95VpV8/jADSD3XDjplGXYXXpYyXRhJ6SWTnfraFzSNn/ouGEOJkIWJOcVruH1tf9uTW2we0Cqk2/ie1j+pSPLx1f9slSEijLKoWTrMuH1oVBPTfrHLF0Ko9oBbppVJOavY/Ka20tXcwLxsJTkgOQjGbpwI5Qp3QCldQaVpreRmk+SeQ4z/FmuCJX/+gA7MO5HFE5ngpT/o5RCxF4DQi4EeBV2RJRlCyiaY7IOpg+ifHkeiBw02DZgWR5BMD800S8QSTrZgXMhOCfErAR1w+H95atIsYzaiZ56icSnTzCBOsOR5xj5DphAMzB94iYvBHt8KfOVmRFbMEbeGcgsuCalZAEsa/OB4IDrvNmT8AwLtwu/QoXAnfhOghJSMPNFUvLlmPs6+F2yC4AcEezHi5DpbknC5riPMEN2yb9Vf8tQ0mG12KIRgIhemsViYlCwOzk8sz/RAGthq2nEpeazRmimyW1s7gbN/S+JFj21kI2Bg0fOcH7brdxpnIjUSWT9ri6KnIHWHzF/Kic2P2uHkLb0cRpEQa4raGt81hEz8d2o5p6J0Ha9+of4fR4ftL4WHycMEV7v7cZavhMihpcg5ZqmEfXbCVFNMWwVdw6OaWLf8/BD0BG/HwMKwmdnqRWsRbGv7wgbYVWAscYz082xHi0pKBaaTsealDdTWpaopKkt2OIdQ6Yhb+uaqO80sVZycyHXI+XvoPENJRu2I9XA6li2Y8nH0yc9/6S2+Ch+DYhqFnmx7fsOV+YGm4iU12sgBRtQp3xQjauM+hq5HYKx22muhoG5qGx2Or4WQZSBjNQjSt28xRyfR7PORyoek5dCOXvnFPtOvu5Z7ygljPZxDlXFB6F7550Mu8RNPY9ytOZe5ZUMcCYBbr++RKTG4z6GNxsElU4YLFnA0/YwIbg2IOYTZ4+RXwllm4l2LuUSEkxYVts+Zt67wX2DHYwcbf69gN9U4VDUksNXHbFUn5kc3qZiKScxStELTUkrEvNF7nSFVxaShoO9pU5anxHKwvCtWkCzBRLfrK169+HaVYActKY1YRVByOERN8zqGfop2xjfDKn5s+cs1rGByY0VQyWbQtV+/ui8atSacD6TmG2+5mlE8J3lzjTb/EYGHn7XruGOr3GPQc6uEvhF18CUVf3X/9M8D6oZQ9GWWtjASO9ET3oif8dvw6VwiTb1nKB4soOqs3segu8c+u/rKTLxxlarn7QyEh1Ihux8weawi1bdlKAkGWdKH9+YDtAFbMQscttpRwxc7BOTNWGjlQb6te1pKsUFUuifPqcX+7a5iNMssdzA1sGBRW7krYYpONYzjWxTdzjltP1LzkJ/UtmzO7MVJPksXB9Q1NkDFqX469f+Atz2SBsxoYsj8Wf+bykx3H1zHOf9fR1MPWK9IesUGCKRccmXr7tQ41USDpGUd9rKDKNJ4g4hLPb7b4w52lxT2wFRpv/FUX59BQWF6z9snJ9+6uaAKzyl2YVaRCj0VacWmkRvAgNSg1AyE3wFthtjeRaE/dNvjj/Zse2f1A03CS/d/xB9itbbfX3vzBcrahhbnWzvrWjMqCIL151+w75ofVB22rZ87JFGJGuPzRqEXoLj1QXW8NirE+mAvZi0KXjH4qR6fT2TmkuaSS9K9pXDyvzapbVIvc1VI8BoshxAXQKObWzJpZWZNuDrQaKbVQLOT9NIj5MZsBzIpmmzvzL1QRvR5nAIZcYDOIg7LX1/bfVHQb3A33+w6NrumYNV0g+zT5Fug878L2mjmdG63r4El4cCxxg+AgHnAR9l/0989+53eojRFLfZXPawvLUTmKQbuAtmvdhblB12x5NhyHRwFWmtBMJd/yr8D1MA7j6mgMUy0Bk4OEq0TP6aV87r72oBBGywqapUpKxEr0SaRNdPSLPEbLYhYIjWiGlmjd7e55JSev/IBxTGa9sBROuC8Zvuoifo/oVksykM1XW8RiffRy9SGYhH+CY4cHesefjFzJI3EkQese6V1Ht60xkyhDZmCM8B3iDuUm+4p8dVUP/bDtd3M/MNLAr/hHqQg0SA2Weku9vTpc0Tw5f+iilkfXM+eX1TLRpTscsiGq1MjXm1Wy1zu5ZEehzuFndOqyiF7Bu8CB5lZWmK5SD/qYtUyDElIqpdwprz+llXBBEpSjoYvXbt986Tz77HB31brB5u1kPxSIBXKBb3nT/LHmfUvuj94Lb8MT3zjaAR7qs6Gra3YJzJIk5FdFeURKs/SGUV0RCPJlkYpIgykx0yWM0xP8+fSBp5+Au0B0f7FiU2xWTEc1sCsl7ir/lsYZUAQXi/OK11U7B8wsgHMRD2NJpE6GYdhEl+CxtjSiFbCX1Q7fU6wHDvjQROyzkKoForxEOzGUHIWfwMNXXDI8/0T2ydrXPniUPYHy2IvJfET3qAbe2o6saAbEEZE38Pw/ygYF77L2SqetsbhAvjPOnA23Z64aTd3RyUKvM/2x8YHmDsTiPngRwrv8q47TRWhcRVCiEJeSxdRZxRxPVoqLYkWwHDxXGI1m1cNVwAYf/j7rH2Vz4kfmLq0vvW7LJi+Ta0LSgNXDDdg7LLZmPZdACJTwrCtiXpHgJwyNYdGvlySlcfuku4eE4CnIfGUV9+ngz537IJyepBHiULLNTGWl8iLkijcLJx7ovfsdfQa8D25WKCNdNC23C/kZYkSxeNMoQk2Z09bK26EKEuwUDUMp1RydLal6TM4qy/g21oeHxMqWtR1ateI2uAY8vehVbj4IyumDYCUW0Yl5SW4WWuIaeEVY9NC6K0fhR3BiS+fBYmZngWd8947Mj1cL8FfMAlb9ofwkDRPdY4vVVtgB1gO9VvP5W9SB2zuoVjgSwMBu3+Me5zxijJ9zYfksnzYJSt49201CWKUdfLL5ynwGa20QQlQVs8V/AdYmRexdzek6mAP+GUoVaLQALJzGFxALF6S9JCgslZpJd3SerT2y/ab2LwO7H8Y/2PEFRbNP2PjZ2zaby1KlwrVVjY2omZzH2ibFZFnJlL7Awsl3DCum2RZI+yrTLtuXdsRtDQEiUM6UZUPVEKyF7DL7AFHD66+CB+DIuiuXLpzZWjo/cYiU0QHONj3mdsiVcq1TVbSOLOKt00pA+higG1hsM6yRKoQN1vVBx0zRLbjlcPrW71ZdD4xCBfNs/kcFjelCWblohp1EvlB2iTAPLoGUacH3L359zS5V5A30saS31u+w6AVGAVJjVKvy0T3+KNvP/MYqTKnXw1e3D90HrBXc+UJZpWA2dyTNQtm2BZH1sImkq8xC2ZLXLtrptCheRNuoUeDxupwBJQS4ySEHgy8d2sE8X7fMJkFor4JHdg0ixWkD1wfj56tl04SBnK2aORTRboR9kpHInP63M7cVZhNZ1omXLgKL4LfyYSrouTLiIiEyJizbyL41RaZa2UtOS3nKMVPPVTcPoDsixbOx/2DMpmOSAhU5tpbdU5yjxCbFLLVcGtbHkZXv+KRUOj0S7vzXT/TfaS5WIUhxN85Goyt3Wds4B3pSln0XmaWDMyz1dRWdaCW5Eq6VtKOZ9+OLBcE6/JOX4HuQmrS2IEC4YAwGiId27cI4VH9O83a4CMjBM4kLHWorwCYz/21ZEJ2URnAqN8G+HcsufVqqhN+Dj2XG8gI7X9ud7qIQpq93KXAXQYnGgq+9wxZeUoqZKJn6eoyo9kwOo1un1EjcsFywQLnk6AdAWWFINJcQp7EdnFNHCIdR3uwryrVA/dsBtmPi9e8y418Lma6fh1Gz60iGZ7rN4zRzvR5u+KIa2wW6nfYn+0BN07wQu3jsw6bVoXUhexdA8MBtkzcUXo7mvgK+BeHd/lW3whK8RT9cGgXIVVg7gpsatm5oGOoewGNmwQ8husu/5kZYjQKXoICTkiQOcXIB+F4Evu22RqOKHV/oY4qjP7RupL224LnD9FFHb/VLLNC+ObzWz0ObnZV1N1h1gWoAckEQ3DiNnXA0Zs9DcAKcQTkopyKSwcnkfiQ1T0P2lhWfqpLR82EOA8dCtI0zpARdbOfqoPeSjZhKl8QxVarFjMVwBGLJsqfhNuWy4NdaH7dXCVa5wNbeUtSCmja2qtt4j3GIsIo/ycf1QVtr/a+ue3IVDEDDgL1PSQcDilqUuWx91c+J7ByTRbM6EgHmuAW8W8s+iQKYjvzoFtYN7Djc+Ud4berPiFUcFaZNqhgafIbZI8FDCxtY375VGwX2S7iF9T2ZdRB5o2GR6mpcBA7BxSzRXMs/zUVJhHbOnthraleP9kiVkeTL7VpFOX5n7ruQxxJVLajgr0GlSZiNU0lNZbzyLli69ZV2ThdEayjqimYNBB67nypGYzCWURw1MTStEPgmnu+QYmGU91WAhDKq6I4EUKuIGUnabIHDzdvZbOvDTGXAlB5IotNh8UANrMgJC8T5aUDHE3VFC+h/75LS/nytwS6KQcx+QeYkGaNpgBJnxqxCRa2cy5jh73W08SZvQl37UbnlUBqSo7xVxfulzVqph1vtb6lAX1ASnEtwAM/58byAkrR13oYQx0GxNxtx+eXCBp5ckHwL5d/93rPsZICyL4FMkIZ9AhnQyB6ZslvfYok2Zq849eIz7Bt+8ipspMp0LDYreqJHNAirh7Iph+1tlry1siKy4M6PyPHaiOtL4yfbfO5FG1Mhp71x8wtkx2fSz8/Ut7RsAeTALBBzCWFGzuqHbnj8y7mKa68+8vN8AYU3DPYb9rrN5vEoxUh3YyWYRgrEKtgVdiW7asn8t1jbxlGOtlcuaWBIGmE2tJfMrjMGAdSSNKJQEzIcMSk21RoeZAjX7e9p3bVl060tixQNsUhg77DXrFa3W0WukS6sMPN9XuQDBjvGrhuYte2e8e3rFy2bsyv1C2AeoHdsPj987nOBSwhMWg7YO2p+fR8qdhBmDvqWOrpr/QFtNKUneHvsyjtZI1tpJ2c+tmbDqMk8PjeeeedJ2/76ggNSUopnmUMMiDG0sV13tZ0A5oRBxmFoyMu9BedBK+RtAyMmtqoJ0S0GlRqhqOhdvVwtmMVy7Cn/BgmeJ7ebmipG36k0C04+tot14OBf2P0F4r+QQ5K5ZNw55BwrnDWY9RtejMBobF5/kT3KJdQCtTCQyrjro9mcDQkiWKiFXLVn3hHMMpa6WrN6sVwMZUKxta2qoh0nVtWMakzxeB7VMNlSGnML/YtgD1xZ7V+DpN9c6NrctKplwvDxmLFJIavPb7PqbtkNYfBb7P7ZV6ROYMJUKKbUVOVL37r9N+jhOxrmLl625EDdTfAXePoXOk/yoF4DtvO0/bMzwhw9YC4pSBZJStRdbPkIDsN74F0lOGhDbWZD4W6Uah88C1FMR/bDfAw06+CSlNUmOTiXd/G2HpZG4xmH3Y1Ju9liWAvF1ZZ6JanF7qzeklmIPsqegTtPZe6ztVdX8VxpYa7ft9zWOf4S+1cMs9fA2rINZdUTL3WEZQcyLc5RP4y5PpBKahF8VN9wXgnks1VfQUoXihqdr3KbrF1SbD7bzJT1J5GGMWFeB/Oa5c3JOW8WwX6e/ZRVYVpZ3uIcUoqR26TJdXQNEmWH4EndcrL22v+JRYtOWEpm0GvJPNEpF7QxjeneF4B9FQ6x9Tqr10mtIINKXJyKJ+jxns8EkHPx429vFGEE377a67700i+KHyN1F5cfjR/MPv6VK38ILAbHnq3tWfHgHXPuB9YAf2KhXlZvqfVXc+oyNIyQLxTQs5XnwQqjVAdzMqX/SrgdNq6KHkCY9kHMo5WVoArKkSdyCQsyd6X/KOpwS8Q5IkSEa7Y+8TGN1+nlJzQHMa4yUtCZ0pwYBEJELQxbNE4qsMrO3XItLQ4ZJnRbaDijRULJvs+b0bkAdSMc/1B6BtzcSfU+8VK9Ti/JPresl21FIK6GUbFJjOQLfTZwEVt5IF9HjUBwq3MgVbzI1qrOFr8NC3FrV5ejerQKpVioBtfl86727gX2NtzAhiYudMwLVkGdc5tbBiMSXRpP6OzwviLXnLS9J7hpzU3sahR0GeyuiWhmUawajAophEjume/qtc02U88/whvvN31Y+ZPfDa4oYLb51fYFYVUwBF3jrRiMqqqQmlqhzoZOyit4vDMsBtXCjFSm4Usqhvuh46apXNMp9uE1nQdYLKUUFQWMZChpj6A9bNL7Po0omGALNa9//5Y3gFnhm++UsIVCOSnhqthlxuCQc1SrJL9fu9flE2VM9LNFZgMHEEjkLr6Tfuia08IEll7EAkHtLuUqopmrR7XlPRCHBTZhq5tlRjBSsRte+JEVs+wsCclJ2TUfQ7jQm1vUm5hh6X7YrgVZxFdrZJsKVTgAPXUfuZewDaxwE9sJ7KdgsG5f3QrXl91sA/wS/jphv8xuWfnooqXlwZTNgyocU1pyDym1im+l6FMKlu8/0fRyAwsu33m4pr/iHjZxK8su1v8pKZXpKvqrIunwMwiMSYdKrq5h4p3tfFIINqJ7JXKCi7cTgbPwcpmbg3kQ+W5W8Fml2H3dSAfMhXiTJ/BgNVvvNLDMSs7gUCKq/8jNfkYC7n3XFb+ZdlQnveAvyy1zzEomi+/seXXkB7Us9mS6FdVt44BDXQVmIumzt7Y09cznF2+EYWgKf6/LXK2gApElWaGUEzme4/A/Zy5LmB1NssArVOMloiAoJnQiyWA2xiGCmv1zvFdXddm0I50YVESX/34X8AI1u44EjGgK2JGvUHNthCPA+Sxivg1KNK9trl3wlOb7o3CnlG/ksoOXYj5rrmoQqvl4sxKvgkzzayJUzNeticjLPzBxySTjeAuqEbyxmG+ye7SbSjyGMJP8UMWW8c/WYz0bY3sxk4ekJSA6kP5wMogSEgK/iawWIXFJ1wakAF6wRxySXwdeLTIb+aSlepngEFyaYPJ+TgA/N9uRUUZMtoM0YXMgWXMU98KD7ZTm+71kTjb71uzUKhUoMzgxzOO4iNnyi4MXOHN2c/jWtt7IWsvA/MmUlbM6eX9GSxu2iCq5iE/t8tXrAXWl7/mMGxSqgMJpgqAQybwCMRM7WUWxKaoiOkULKoSa9ScRs0eLixRLGYdZ8iujH3VQn+5yocQVq0CogNoQCJiQaLaRUYFTJE0BY7orzNxovgENxvgvagsjYnggZXaVSEHrlcONYBaw19HZlY3JwmrnkFZBfJBmXzHbvKxNWrXZ68FuFSd8D7E4rAkgmFmapIDTE+aXH4Gfwl13DQ7mrk2fqH3r7fvYetgHE8mWZMDQxee6Ra+H49CONF6m1UKxgHrxEDnsCKLlmdZjPkSC5iLxeEMOdS0IWrEqkgTlzI473mmy/QAoAdFutsYK/LJMTtKrUHNUV9yuKHUTSqO8wXn5/FKbaLNbzcwODFknCiZBOhA0SsFhRZgrlwXJgxBnWB5vN0TzKQ7TQClvtuNSqIMuuuYLW3am68wx8ChlzYxnCeQGObgZtt815+438HJvgMoaqabmn4WpMJcTi/lxcccQfnbk5LDoRxNsxXyag96fIrldyVtt3S3hStgMdBI5xVY0gU35dxdpaJosLovEexrWwjKI1Nha9VKzSERObzQXx3mnXlpWZRarVgHsPdhTxn435wYnstQlM+exk+0sIU9JKvMa7J2OW69Gq5zYlGb3VrKMwq57o6uG93B1og6Cjt5hhVDaVoMZQs9z7WgjBHUScgcoEi5r3KjjHIaPW97zWYYoSPmHmVLoYVzY+qNf+XP5dhwMXkkxxseTf6WsQ4rbe5ojOVgO2qCQIBY+BVahgF+CfH4pNwxdZJi0BgeN5sDKXcP3wm7YnG2r3rrMuu1zrV/cJwWVC29ejmwfikin/fgS1IG7VooJLgyxLnSCEOfKvchaA8+LLqM6U1+9YkE21hIDiXIo8Nbaoi6YC7V97lGtuqR2HtwIly4/fMXM9saSnPsQ0qEezjE98lJoD+a7vggTaONntFVPWDxD0kitvmFZVeCZhxZqRbjx8hYqxY9+pfVqeBtcLL32CynotBllC5FnOSGcL2f1hhfCIhodMMtZQ78d2yWb5SwD4s4Kt0PTg0YQZa0RTfnRPRuHWTfzJzdBvVnOWjl0EJgF7PlyVjHq0QWRfN9XX2QcFpNYv1nOGnx3zk6rRTLvVlPZjDwQHKLDmNoxpRdsJHVIbx9ZM3gImA6O831fhEzLnOQrWIYkKrLfY/WEM6ePnLkjWpyqZim04ELAJKMwSVQyKsUK11/LPGzlgi3M/f5rp6pKE1Fbq1HXUNWCYTTi8QTYs1M8OzZFAtEmpQE2mN3lFxaszjdcnk9IP6VpbiG3fdB89qxSiEgBGKHVbBmSHLPomNdWObSHyRzKLsZJlhM7DUOQBKm7/64H4D4oWKtVI88opk03kBugmHadO8sL8zmyk5wpvNCrNgOsRcyr7nGPK10oy62w+fKm/t1Fa+FNkFhTHkbJhb1p+YJV/nqF0O0UlkhvzPk+I3d1lrR6o5aoMvUzDHHmmgZo2RwijBngmFfzknLiaFdLyswSpLkUrGBQcuJkpx4xlygwmmOqWgsNe21sWd9f//XNf1YYf7YwRf6RVZ2l34tby7o9rHT0ruz25GVx99zghq17feDgNiRWoIUPwRMQ3uGdOIzpaCFyhPnhRNbaAuCdcB1aP9rT2ZQnqU9DdIcbjxlGRuaFKkGIc2ZzksFh4BU8/lgKZoK+xDUoupEuWNjwUuFXvuW+JW3tXeWPHuUedQ37LuqpSwdHWleF9yXY9ZfYTPqh6SVmrOmHYaM/ZOFNeukHq190y4lqy4iz3tKn1MOXofq623vyaT6E0A0dNGoBPYKS0+GVLkmUuBpkBiIU2TK8DyrMLgG8prnc/WEX0VFssNQMxW6LzeelZvueyV5Uk4wI4RnLK69GXTi9Oc+kGODswHEysXvQJWweLmbXxA6I0wd5uFxJiOjKgYQZdkSRyERWZCCSxew+08u1Mj7l4fGOstneIZfx5+utQs0vT17NvMAa4eTzwIJk6r0LbasCKkN6Je/C4FDLRkdrFjvHgD0Ex9jAzZ1SSKSyFIrw0SqYgOjB1oF7+RuhQVdckl6ewJBIHWfOTrDbDn4PVUxugOkdyBxOUzAbTdTpQZld9K+0Wxo8YavAp2XVi2HbZheDQEUbFEmNpbQLAcUx8atuKqh4xnpiSgClFuDRmWUO8dxiPp9I8k8oQVQ8ZrlCCJskUiD5/hU0Yaue4/MtBrpulf7exVtssSLzuReKyb1EeFVw6xi/8SqaT8CE3BUSg7xdSKiVXAG1mUvGCFsoGq+Dt5uMTsforvHU4NYVDdWajMpkMjLvIW4t5YgradFfqZrrzKriEj3EavSZIj+fJOcXjsq/c/IJdthF2I+lZAINq8ZshCgh7FYSRnqG9sP+7r2H1TX8oeLb33qcHXIiucB4LckJk1dlzF4MnZrd9W2P4bdZ+FGU0XPZv/vuZfW/ai99+qmdj0gzPcQRea+7lkM4FsVgYpZb+F4HkcEsKIAiE8IVueNZjDCsgf0tEdq5u7Hj9r/Iiq4rKGfOUPKUWUDKPH/lppsa99mD4xdbQChUoBsyJULA7A/yoKoNhepmU4IAc9CU2P9ZPGdy3dydk0cFmcqahBJTZMmsPhDqcFTWz9/iK93zjRm1y27n5AXQA4nMBfU17vOLKYLYBAecQ0VfuQJVNgjNs13DttYKd8DSFS2OqiWRK46y+WyJRs78iYbMHjhTnEFTnAKUnPm3hx0r26I7LE3yeOgJuZb3SbHwthNte+A9qGMWY8Y0/alEOkUz4uaWFWP5Xiy9XE5xUWVGER5SJUfNasWawmsEchj53R4aJlVUkPHEkMmugJrlqQXw5l8OmkV587kLpLKSOP0EDpdvhjL9nebfRYLZjdnIYxoN0mWrB8zMwSJYkFOT6Qc18KVaRAuK3oooQEU0chFPktDEDKKL+WciKF7GXJID0+aFvCGYV80/qEcoN/2UDydQybR5maicymtxyWWmCpKq6LKuUrMFxfKjDsFlMcHCbDLjOEenowcp5TjoRcDpypyq5bEZ0Ii8qdN99+yRZmaT2nYlF5eKcqSUnwcbSwG6FDlMxDrObOL2400VarbrI5O1IfZS6loeT4iu1CRmenuHpZDkw4yKzK0ocslFVHKrIdSUqoUMu+aB+9pjWg16vBd8spc04IzCOCwX//8A"],[16356,"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"],[16362,"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"],[12532,"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"]],invalid=()=>{throw new Error('Invalid math font data');};
const inflate=(encoded,size)=>{
const source=atob(encoded),bytes=new Uint8Array(size);let position=0,held=0,available=0,written=0;
const fill=count=>{while(available<count&&position<source.length){held|=source.charCodeAt(position++)<<available;available+=8;}};
const bits=count=>{fill(count);if(available<count)invalid();const value=held&((1<<count)-1);held>>>=count;available-=count;return value;};
const tree=lengths=>{const width=Math.max(...lengths),counts=new Uint16Array(width+1),next=new Uint16Array(width+1),table=new Uint16Array(1<<width);
for(const length of lengths)if(length)counts[length]++;let code=0;
for(let length=1;length<=width;length++){code=(code+counts[length-1])*2;next[length]=code;}
if(code+counts[width]>table.length)invalid();
for(let symbol=0;symbol<lengths.length;symbol++){const length=lengths[symbol];if(!length)continue;let value=next[length]++,reversed=0;
for(let i=0;i<length;i++){reversed=reversed*2+(value&1);value>>>=1;}
for(let index=reversed;index<table.length;index+=1<<length)table[index]=(symbol<<4)|length;}
return {width,table};};
const symbol=code=>{fill(code.width);const entry=code.table[held&((1<<code.width)-1)],length=entry&15;if(!length||length>available)invalid();bits(length);return entry>>>4;};
let final=0;
while(!final){final=bits(1);const kind=bits(2);if(kind===3)invalid();
if(!kind){bits(available&7);const count=bits(16);if((count^bits(16))!==65535||written+count>bytes.length)invalid();for(let i=0;i<count;i++)bytes[written++]=bits(8);continue;}
let literal,distance;
if(kind===1){literal=tree(Array.from({length:288},(_,i)=>i<144?8:i<256?9:i<280?7:8));distance=tree(Array(32).fill(5));}
else{const literals=bits(5)+257,distances=bits(5)+1,count=bits(4)+4,order=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],lengths=Array(19).fill(0);
for(let i=0;i<count;i++)lengths[order[i]]=bits(3);const code=tree(lengths),values=[];
while(values.length<literals+distances){const value=symbol(code);if(value<16){values.push(value);continue;}
if(value===16&&!values.length)invalid();const repeat=value===16?bits(2)+3:value===17?bits(3)+3:bits(7)+11;
if(values.length+repeat>literals+distances)invalid();const length=value===16?values[values.length-1]:0;for(let i=0;i<repeat;i++)values.push(length);}
if(!values[256])invalid();literal=tree(values.slice(0,literals));distance=tree(values.slice(literals));}
for(;;){const value=symbol(literal);if(value<256){if(written===bytes.length)invalid();bytes[written++]=value;continue;}if(value===256)break;if(value>285)invalid();
const code=value-257,extra=code<8?0:(code>>>2)-1,length=code===28?258:code<8?code+3:((code&3)+4)*2**extra+3+bits(extra);
const offset=symbol(distance);if(offset>29)invalid();const shift=offset<4?0:(offset>>>1)-1,back=offset<4?offset+1:((offset&1)+2)*2**shift+1+bits(shift);
if(back>written||written+length>bytes.length)invalid();for(let i=0;i<length;i++){bytes[written]=bytes[written-back];written++;}}
}
if(written!==bytes.length||position-Math.floor(available/8)!==source.length)invalid();return bytes;
};
const unsigned=r=>{let value=0,shift=0,byte;do{if(r[1]>=r[2]||shift>49)invalid();byte=r[0][r[1]++];value+=(byte&127)*2**shift;shift+=7;}while(byte&128);if(!Number.isSafeInteger(value))invalid();return value;};
const signed=r=>{if(r[1]>=r[2])invalid();let value=r[0][r[1]++];if(value>=240){if(value===255){value=4080+unsigned(r);if(!Number.isSafeInteger(value))invalid();}else{if(r[1]>=r[2])invalid();value=240+(value-240)*256+r[0][r[1]++];}}return value%2?-(value+1)/2:value/2;};
const complete=r=>{if(r[1]!==r[2])invalid();};
const [unit,metricUnit,metricBases,glyphs,contours]=(()=>{
const bytes=inflate("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",25139),r=[bytes,0,bytes.length],unit=unsigned(r),metricUnit=unsigned(r);if(!unit||!metricUnit)invalid();const metricBases=Array.from({length:3},()=>signed(r));
for(const name of ["chars","dotless","extendedShapes"]){const count=unsigned(r),map=MATH_FONT[name]={};if(count>bytes.length)invalid();let key=0,value=0;
for(let i=0;i<count;i++){key+=unsigned(r);value+=signed(r);map[key]=value;}}
const scripts=MATH_FONT.scriptAlternates={},scriptCount=unsigned(r),previous=[0,0];let key=0;if(scriptCount>bytes.length)invalid();
for(let i=0;i<scriptCount;i++){key+=unsigned(r);const count=unsigned(r);if(count<1||count>2)invalid();const values=[];for(let j=0;j<count;j++){previous[j]+=signed(r);values.push(previous[j]);}scripts[key]=values;}
for(const name of ['vertical','horizontal']){const map=MATH_FONT[name]={},count=unsigned(r);key=0;if(count>bytes.length)invalid();
for(let i=0;i<count;i++){key+=unsigned(r);const variants=Array.from({length:unsigned(r)},()=>[key+signed(r),unsigned(r)]),parts=unsigned(r);if(variants.length>bytes.length||parts>bytes.length)invalid();
const record=map[key]={variants};if(parts)record.assembly={italic:signed(r),parts:Array.from({length:parts-1},()=>{const part=[key+signed(r),unsigned(r),unsigned(r)],full=unsigned(r);return [...part,Math.floor(full/2),full%2];})};}}
const tables=Array.from({length:2},()=>{const count=unsigned(r);if(count<1||count>bytes.length)invalid();const offsets=new Uint32Array(count);let previous=0;
for(let i=0;i<count;i++){previous+=unsigned(r);if(previous>=pages.length*32768)invalid();offsets[i]=previous;}return offsets;});complete(r);return [unit,metricUnit,metricBases,...tables];
})();
// Each page and glyph decodes once and stays: the font itself bounds every cache.
const pageCache=[],glyphCache=new Map();
const record=(offsets,id)=>{
if(!Number.isInteger(id)||id<0||id+1>=offsets.length)return;
const offset=offsets[id],page=offset>>>15,next=offsets[id+1];let bytes=pageCache[page];
if(!bytes){const source=pages[page];if(!source||source[0]>16384)invalid();bytes=pageCache[page]=inflate(source[1],source[0]);}
const begin=offset&32767,end=next>>>15===page?next&32767:bytes.length;if(begin>=end||end>bytes.length)invalid();return [bytes,begin,end];
};
const commandLengths=[2,2,1,1,6,0],commandNames='MLHVCZ';
const contour=(id,local,depth=0)=>{
if(local.has(id))return local.get(id);if(depth>4)invalid();const r=record(contours,id);if(!r)invalid();const header=unsigned(r);let commands,coordinates,closes;
if(header%2){const parentId=Math.floor(header/2);if(parentId>=id)invalid();const parent=contour(parentId,local,depth+1);[commands,,closes]=parent;coordinates=new Float64Array(parent[1].length);
for(let i=0;i<coordinates.length;i++)coordinates[i]=parent[1][i]+signed(r);}
else{const count=Math.floor(header/4);closes=header/2%2;if(r[1]+count>r[2])invalid();commands=r[0].subarray(r[1],r[1]+count);r[1]+=count;let values=0;
for(const command of commands){if(command<1||command>5)invalid();values+=commandLengths[command];}values-=2*closes;if(values<0||values>r[2]-r[1]||closes&&(commands[count-2]!==4||commands[count-1]!==5))invalid();coordinates=new Float64Array(values);
for(let i=0;i<values;i++)coordinates[i]=signed(r);}
complete(r);const value=[commands,coordinates,closes];local.set(id,value);return value;
};
// Bounds derive from the outline with fontTools' BoundsPen, operation for operation, so each value is the one
// the generator would have stored.
const quadratic=(a,b,c)=>{if(Math.abs(a)<1e-10)return Math.abs(b)<1e-10?[]:[-c/b];const d=b*b-4*a*c;if(d<0)return [];const root=Math.sqrt(d);return [(-b+root)/2/a,(-b-root)/2/a];};
const cubic=s=>{const cx=(s[2]-s[0])*3,cy=(s[3]-s[1])*3,bx=(s[4]-s[2])*3-cx,by=(s[5]-s[3])*3-cy;return [s[6]-s[0]-cx-bx,s[7]-s[1]-cy-by,bx,by,cx,cy,s[0],s[1]];};
const add=(box,x,y)=>box?[Math.min(box[0],x),Math.min(box[1],y),Math.max(box[2],x),Math.max(box[3],y)]:[x,y,x,y];
const inside=(box,x,y)=>box[0]<=x&&x<=box[2]&&box[1]<=y&&y<=box[3];
const curveBox=(box,s)=>{const [ax,ay,bx,by,cx,cy,dx,dy]=cubic(s),roots=[...quadratic(ax*3,bx*2,cx).filter(t=>0<=t&&t<1),...quadratic(ay*3,by*2,cy).filter(t=>0<=t&&t<1)];
let curve=add(add(null,s[0],s[1]),s[6],s[7]);for(const t of roots)curve=add(curve,ax*t*t*t+bx*t*t+cx*t+dx,ay*t*t*t+by*t*t+cy*t+dy);
return [Math.min(box[0],curve[0]),Math.min(box[1],curve[1]),Math.max(box[2],curve[2]),Math.max(box[3],curve[3])];};
const glyphRecord=id=>{
let cached=glyphCache.get(id);if(cached)return cached;const r=record(glyphs,id);if(!r)return;
const metrics=[];for(let i=0;i<3;i++)metrics.push(signed(r)+metricBases[i]);metrics[2]+=metrics[0]/2;
const count=unsigned(r),local=new Map();let path='',box=null;
if(count>r[2]-r[1])invalid();
for(let part=0;part<count;part++){const contourId=unsigned(r),firstX=signed(r),firstY=signed(r),[commands,coordinates,closes]=contour(contourId,local);let x=firstX,y=firstY,cursor=0;
path+='M'+x/unit+' '+y/unit;box=add(box,x/unit,y/unit);
for(let c=0;c<commands.length;c++){const command=commands[c],from=[x/unit,y/unit];path+=commandNames[command];
for(let index=0;index<commandLengths[command];index++){if(index)path+=' ';
const last=closes&&c===commands.length-2&&index>3;
if(command===3||(command!==2&&command!==3&&index%2)){y=last?firstY:y+coordinates[cursor++];path+=y/unit;from.push(x/unit,y/unit);}else{x=last?firstX:x+coordinates[cursor++];path+=x/unit;if(command===2)from.push(x/unit,y/unit);}}
if(command===5){x=firstX;y=firstY;continue;}
if(command===4){const end=add(box,from[6],from[7]);box=inside(end,from[2],from[3])&&inside(end,from[4],from[5])?end:curveBox(end,from);}else box=add(box,from[2],from[3]);}
}complete(r);box??=[0,0,0,0];
const glyph=[metrics[0]/metricUnit,Math.floor(box[0]),Math.floor(box[1]),Math.ceil(box[2]),Math.ceil(box[3]),metrics[1]/metricUnit,metrics[2]/metricUnit,path];
cached={glyph};glyphCache.set(id,cached);return cached;
};
MATH_FONT.glyph=id=>glyphRecord(id)?.glyph;
}

// SPDX-License-Identifier: MIT
// Command spellings name Unicode characters; glyph outlines belong to the font.
const MATH_SYMBOLS = Object.create(null);
function mathSymbolGroup(kind, entries, extra) {
  for (const entry of entries.trim().split(/\s+/)) {
    const split = entry.indexOf('=');
    const value = entry.slice(split + 1);
    for (const name of entry.slice(0, split).split('/'))
      MATH_SYMBOLS[name] = Object.freeze({type: 'glyph', value, class: kind, ...extra});
  }
}
mathSymbolGroup('ord', `
alpha=α beta=β gamma=γ delta=δ epsilon=ϵ varepsilon=ε zeta=ζ eta=η theta=θ vartheta=ϑ
iota=ι kappa=κ varkappa=ϰ lambda=λ mu=μ nu=ν xi=ξ omicron=ο pi=π varpi=ϖ rho=ρ varrho=ϱ
sigma=σ varsigma=ς tau=τ upsilon=υ phi=ϕ varphi=φ chi=χ psi=ψ omega=ω digamma=ϝ
Gamma=Γ Delta=Δ Theta=Θ Lambda=Λ Xi=Ξ Pi=Π Sigma=Σ Upsilon=Υ Phi=Φ Psi=Ψ Omega=Ω
varGamma=Γ varDelta=Δ varTheta=Θ varLambda=Λ varXi=Ξ varPi=Π varSigma=Σ varUpsilon=Υ varPhi=Φ varPsi=Ψ varOmega=Ω
aleph=ℵ beth=ℶ gimel=ℷ daleth=ℸ ell=ℓ hbar=ℏ hslash=ℏ imath=𝚤 jmath=𝚥
Re=ℜ Im=ℑ wp=℘ partial=∂ nabla=∇ infty=∞ emptyset=∅ varnothing=∅ complement=∁
top=⊤ bot=⊥ forall=∀ exists=∃ nexists=∄ neg/lnot=¬ angle=∠ measuredangle=∡ sphericalangle=∢
triangle/vartriangle=△ blacktriangle=▴ triangledown=▽ blacktriangledown=▾ square/Box=□ blacksquare=■ Diamond=◇ blacklozenge=◆ lozenge=◊
clubsuit=♣ diamondsuit=♢ heartsuit=♡ spadesuit=♠ checkmark=✓ maltese=✠ yen=¥ pounds=£ euro=€
S=§ P=¶ copyright=© circledR=® circledS=Ⓢ mho=℧ Finv=Ⅎ Game=⅁ eth=ð
prime=′ backprime=‵ doubleprime=″ tripleprime=‴ degree=° flat=♭ natural=♮ sharp=♯
surd=√ diagup=╱ diagdown=╲ Bbbk=𝕜
`, {variant: 'roman'});
// Lowercase Greek retains the ordinary mathematical italic convention.
for (const name of 'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa varkappa lambda mu nu xi omicron pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega digamma'.split(' '))
  MATH_SYMBOLS[name] = Object.freeze({...MATH_SYMBOLS[name], variant: 'normal'});
// upgreek: \upalpha to \upomega and \Upgamma to \Upomega are upright.
for (const name of Object.keys(MATH_SYMBOLS).filter(name => /^[a-z]+$/.test(name) && MATH_SYMBOLS[name].variant === 'normal')) {
  MATH_SYMBOLS['up' + name] = Object.freeze({...MATH_SYMBOLS[name], variant: 'roman'});
  const capital = name[0].toUpperCase() + name.slice(1);
  if (MATH_SYMBOLS[capital]) MATH_SYMBOLS['Up' + name] = MATH_SYMBOLS[capital];
}
for (const name of Object.keys(MATH_SYMBOLS).filter(name => /^var[A-Z]/.test(name)))
  MATH_SYMBOLS[name] = Object.freeze({...MATH_SYMBOLS[name], variant: 'italic'});
mathSymbolGroup('bin', `
dotminus=∸ cupdot=⊍ barvee=⊽
pm=± mp=∓ times=× div=÷ cdot=⋅ ast=∗ star=⋆ circ=∘ bullet=∙ diamond=⋄
cap=∩ cup=∪ uplus=⊎ sqcap=⊓ sqcup=⊔ vee/lor=∨ wedge/land=∧ setminus=∖ smallsetminus=∖
oplus=⊕ ominus=⊖ otimes=⊗ oslash=⊘ odot=⊙ bigcirc=◯ dag/dagger=† ddag/ddagger=‡ amalg=⨿
triangleleft=◁ triangleright=▷ lhd=⊲ rhd=⊳ unlhd=⊴ unrhd=⊵ wr=≀
barwedge=⊼ veebar=⊻ doublebarwedge=⩞ curlywedge=⋏ curlyvee=⋎ boxplus=⊞ boxminus=⊟ boxtimes=⊠ boxdot=⊡
ltimes=⋉ rtimes=⋊ leftthreetimes=⋋ rightthreetimes=⋌ dotplus=∔ divideontimes=⋇
circledast=⊛ circledcirc=⊚ circleddash=⊝ intercal=⊺ centerdot=· bigtriangleup=△ bigtriangledown=▽ Cup=⋓ Cap=⋒
`, {variant: 'roman'});
mathSymbolGroup('rel', `
le/leq=≤ ge/geq=≥ neq/ne=≠ equiv=≡ sim=∼ simeq=≃ approx=≈ cong=≅ asymp=≍ propto=∝
ll=≪ gg=≫ prec=≺ succ=≻ preceq=⪯ succeq=⪰ subset=⊂ supset=⊃ subseteq=⊆ supseteq=⊇
sqsubset=⊏ sqsupset=⊐ sqsubseteq=⊑ sqsupseteq=⊒ in=∈ ni/owns=∋ notin=∉ notni=∌
vdash=⊢ dashv=⊣ models=⊨ perp=⊥ mid=∣ parallel=∥ smile=⌣ frown=⌢ bowtie=⋈ Join=⋈
doteq=≐ dotsim=≐ doteqdot/Doteq=≑ triangleq=≜ bumpeq=≏ Bumpeq=≎ eqcirc=≖ circeq=≗
risingdotseq=≓ fallingdotseq=≒ eqsim=≂ backsim=∽ backsimeq=⋍ approxeq=≊
lesssim=≲ gtrsim=≳ lessapprox=⪅ gtrapprox=⪆ lessdot=⋖ gtrdot=⋗ lesseqgtr=⋚ gtreqless=⋛
lesseqqgtr=⪋ gtreqqless=⪌ lessgtr=≶ gtrless=≷ lll/llless=⋘ ggg/gggtr=⋙
leqq=≦ geqq=≧ leqslant=⩽ geqslant=⩾ eqslantless=⪕ eqslantgtr=⪖
precsim=≾ succsim=≿ precapprox=⪷ succapprox=⪸ preccurlyeq=≼ succcurlyeq=≽ curlyeqprec=⋞ curlyeqsucc=⋟
Subset=⋐ Supset=⋑ subseteqq=⫅ supseteqq=⫆ pitchfork=⋔ between=≬ Vdash=⊩ Vvdash=⊪ vDash=⊨ VDash=⊫
blacktriangleleft=◂ blacktriangleright=▸ vartriangleleft=⊲ vartriangleright=⊳ trianglelefteq=⊴ trianglerighteq=⊵
varpropto=∝ shortmid=∣ shortparallel=∥ smallsmile=⌣ smallfrown=⌢ therefore=∴ because=∵
nless=≮ ngtr=≯ nleq=≰ ngeq=≱ nleqq=≰ ngeqq=≱ nleqslant=≰ ngeqslant=≱ lneq=⪇ gneq=⪈ lneqq=≨ gneqq=≩
lvertneqq=≨ gvertneqq=≩ nsim=≁ ncong=≇ napprox=≉ lnsim=⋦ gnsim=⋧ lnapprox=⪉ gnapprox=⪊
nprec=⊀ nsucc=⊁ npreceq=⋠ nsucceq=⋡ precneqq=⪵ succneqq=⪶ precnsim=⋨ succnsim=⋩ precnapprox=⪹ succnapprox=⪺
nsubset=⊄ nsupset=⊅ nsubseteq=⊈ nsupseteq=⊉ nsubseteqq=⊈ nsupseteqq=⊉ subsetneq=⊊ supsetneq=⊋
varsubsetneq=⊊ varsupsetneq=⊋ subsetneqq=⫋ supsetneqq=⫌ varsubsetneqq=⫋ varsupsetneqq=⫌
nmid=∤ nparallel=∦ nshortmid=∤ nshortparallel=∦ nvdash=⊬ nVdash=⊮ nvDash=⊭ nVDash=⊯
ntriangleleft=⋪ ntriangleright=⋫ ntrianglelefteq=⋬ ntrianglerighteq=⋭ coloneqq=≔ eqqcolon=≕ vcentcolon=∶ dblcolon/Colon=∷ And=&
`, {variant: 'roman'});
mathSymbolGroup('rel', `
questeq=≟ veeeq=≚ stareq=≛ eqdef=≝ estimates/corresponds=≙ Equiv=≣
leftarrow/gets=← rightarrow/to=→ leftrightarrow=↔ Leftarrow=⇐ Rightarrow=⇒ Leftrightarrow=⇔
longleftarrow=⟵ longrightarrow=⟶ longleftrightarrow=⟷ Longleftarrow=⟸ Longrightarrow=⟹ Longleftrightarrow=⟺
mapsto=↦ longmapsto=⟼ hookleftarrow=↩ hookrightarrow=↪ nearrow=↗ searrow=↘ nwarrow=↖ swarrow=↙
uparrow=↑ downarrow=↓ updownarrow=↕ Uparrow=⇑ Downarrow=⇓ Updownarrow=⇕
leftharpoonup=↼ leftharpoondown=↽ rightharpoonup=⇀ rightharpoondown=⇁ rightleftharpoons=⇌ leftrightharpoons=⇋
upharpoonleft=↿ upharpoonright=↾ downharpoonleft=⇃ downharpoonright=⇂ restriction=↾
leftrightarrows=⇆ rightleftarrows=⇄ leftleftarrows=⇇ rightrightarrows=⇉ upuparrows=⇈ downdownarrows=⇊
Lleftarrow=⇚ Rrightarrow=⇛ twoheadleftarrow=↞ twoheadrightarrow=↠ leftarrowtail=↢ rightarrowtail=↣
looparrowleft=↫ looparrowright=↬ leftrightsquigarrow=↭ rightsquigarrow/leadsto=⇝ curvearrowleft=↶ curvearrowright=↷
circlearrowleft=↺ circlearrowright=↻ dashleftarrow=⇠ dashrightarrow=⇢ multimap=⊸
nleftarrow=↚ nrightarrow=↛ nleftrightarrow=↮ nLeftarrow=⇍ nRightarrow=⇏ nLeftrightarrow=⇎
Lsh=↰ Rsh=↱ Ldsh=↲ Rdsh=↳ twoheaduparrow=↟ twoheaddownarrow=↡ updownarrows=⇅ downuparrows=⇵ leftsquigarrow=⇜ longrightsquigarrow=⟿
`, {variant: 'roman'});
mathSymbolGroup('op', `
sum=∑ prod=∏ coprod=∐ bigcup=⋃ bigcap=⋂ bigvee=⋁ bigwedge=⋀ biguplus=⨄ bigsqcup=⨆
bigotimes=⨂ bigoplus=⨁ bigodot=⨀ bigamalg=∐ bigsqcap=⨅ bigcupdot=⨃ bigtimes=⨉
`, {large: true, limits: 'display', variant: 'roman'});
mathSymbolGroup('op', `
int=∫ iint=∬ iiint=∭ iiiint=⨌ oint=∮ oiint=∯ oiiint=∰ intop=∫ smallint=∫
intclockwise=∱ varointclockwise=∲ ointctrclockwise=∳ sumint=⨋ awint=⨑
`, {large: true, limits: 'never', variant: 'roman'});
MATH_SYMBOLS.intop = Object.freeze({...MATH_SYMBOLS.intop, limits: 'display'});
MATH_SYMBOLS.smallint = Object.freeze({...MATH_SYMBOLS.smallint, large: false});
mathSymbolGroup('open', 'langle/lang=⟨ lAngle=⟪ lbrace={ lgroup=⟮ lbrack=[ lfloor=⌊ lceil=⌈ lvert=| lVert=‖ lmoustache=⎰ llbracket=⟦ ulcorner=⌜ llcorner=⌞', {variant: 'roman'});
mathSymbolGroup('close', 'rangle/rang=⟩ rAngle=⟫ rbrace=} rgroup=⟯ rbrack=] rfloor=⌋ rceil=⌉ rvert=| rVert=‖ rmoustache=⎱ rrbracket=⟧ urcorner=⌝ lrcorner=⌟', {variant: 'roman'});
mathSymbolGroup('ord', 'vert=| Vert=‖ backslash=\\ slash=/', {variant: 'roman'});
mathSymbolGroup('inner', 'dotsc=… cdots=⋯ dotsb=⋯ dotsm=⋯ dotsi=⋯ dotso=… ddots=⋱ mathellipsis=…', {variant: 'roman'});
mathSymbolGroup('ord', 'vdots=⋮', {variant: 'roman'});
mathSymbolGroup('inner', 'iddots/adots=⋰', {variant: 'roman'});
mathSymbolGroup('punct', 'colon=: cdotp=⋅', {variant: 'roman'});
MATH_SYMBOLS.ldots = MATH_SYMBOLS.dots = Object.freeze({type: 'glyph', value: '…', class: 'inner', variant: 'roman'});
for (const [name, symbol] of Object.entries(MATH_SYMBOLS)) {
  const {variant, ...fields} = symbol;
  MATH_SYMBOLS[name] = Object.freeze({...fields, defaultVariant: variant});
}
const MATH_NAMED_OPERATORS = new Set(('arccos arcsin arctan arccot arcsec arccsc cos cosh cot coth csc csch sec sech sin sinh tan tanh exp log ln lg lb det dim gcd hom ker arg deg Pr erf erfc').split(' '));
const MATH_LIMIT_OPERATORS = new Set(('lim limsup liminf sup inf max min injlim projlim varlimsup varliminf varinjlim varprojlim').split(' '));

// SPDX-License-Identifier: MIT
// TeX is tokenized before parsing. Expansions use a stack, never executable code.
class MathTexError extends Error {
  constructor(code, message, offset = 0, command = '') {
    super(message);
    this.name = 'MathTexError';
    this.code = code;
    this.offset = offset;
    this.command = command;
  }
}

function mathTexTokens(source, offset = 0) {
  const tokens = [];
  let count = 0;
  for (let i = 0; i < source.length;) {
    const start = i, value = String.fromCodePoint(source.codePointAt(i));
    i += value.length;
    if (value === '%') {
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i++;
      if (source[i] === '\r') i++;
      if (source[i] === '\n') i++;
      continue;
    }
    if (value === '\\') {
      if (i === source.length) throw new MathTexError('unfinished-command', 'A command is missing after the backslash.', offset + start);
      let command = '';
      if (/[A-Za-z@]/.test(source[i])) {
        while (i < source.length && /[A-Za-z@]/.test(source[i])) command += source[i++];
        if (command === 'verb') {
          // Verbatim changes TeX's character categories before its body is read.
          while (source[i] === ' ' || source[i] === '\t') i++;
          const starred = source[i] === '*';
          if (starred) i++;
          while (source[i] === ' ' || source[i] === '\t') i++;
          const delimiter = i < source.length ? String.fromCodePoint(source.codePointAt(i)) : '';
          if (!delimiter || /[\r\n]/.test(delimiter))
            throw new MathTexError('unclosed-verb', 'A verbatim span needs a delimiter on the same line.', offset + start, 'verb');
          i += delimiter.length;
          const end = source.indexOf(delimiter, i), newline = source.slice(i, end < 0 ? undefined : end).search(/[\r\n]/);
          if (end < 0 || newline >= 0)
            throw new MathTexError('unclosed-verb', 'A verbatim span must close on the same line.', offset + start, 'verb');
          if (count + end - i + 1 > 100000)
            throw new MathTexError('resource-limit', 'This formula has too many tokens to render safely.', offset + start, 'verb');
          tokens.push({kind: 'verbatim', value: source.slice(i, end), starred, delimiter, offset: offset + start});
          i = end + delimiter.length;
        } else {
          tokens.push({kind: 'command', value: command, offset: offset + start});
          while (i < source.length && /\s/.test(source[i])) i++;
        }
      } else {
        command = String.fromCodePoint(source.codePointAt(i));
        i += command.length;
        tokens.push({kind: 'command', value: /\s/.test(command) ? ' ' : command, offset: offset + start});
      }
    } else if (/\s/.test(value)) {
      while (i < source.length && /\s/.test(source[i])) i++;
      tokens.push({kind: 'space', value: ' ', offset: offset + start});
    } else tokens.push({kind: 'char', value, offset: offset + start});
    count += tokens.at(-1).kind === 'verbatim' ? 1 + tokens.at(-1).value.length : 1;
    if (count > 100000)
      throw new MathTexError('resource-limit', 'This formula has too many tokens to render safely.', offset + start);
  }
  return tokens;
}

const MATH_TEX_VARIANTS = Object.freeze({
  mathrm: 'roman', mathnormal: 'normal', mathit: 'italic', mathbf: 'bold', boldsymbol: 'bold-italic', bm: 'bold-italic', pmb: 'bold-italic',
  mathbb: 'double-struck', mathbbm: 'double-struck', mathbbmss: 'double-struck', mathbbmtt: 'double-struck', mathds: 'double-struck',
  Bbb: 'double-struck', mathcal: 'script', mathscr: 'script', mathfrak: 'fraktur', frak: 'fraktur',
  mathsf: 'sans-serif', mathss: 'sans-serif', mathtt: 'monospace', mathbfit: 'bold-italic',
  mathbfsf: 'sans-serif-bold', mathsfit: 'sans-serif-italic', mathbfsfit: 'sans-serif-bold-italic',
  mathbfscr: 'bold-script', mathbffrak: 'bold-fraktur', bold: 'bold'
});
const MATH_TEX_TEXT_VARIANTS = Object.freeze({
  text: 'roman', textrm: 'roman', textnormal: 'roman', mbox: 'roman', hbox: 'roman', textup: 'roman',
  textbf: 'bold', textit: 'italic', emph: 'italic', textsl: 'italic', textsf: 'sans-serif', texttt: 'monospace',
  textsc: 'roman'
});
// LaTeX's text commands set series, shape and family independently: \textit inside \textbf is bold italic.
function mathTextVariant(outer, name) {
  let family = /sans-serif/.test(outer) ? 'sans-serif' : outer === 'monospace' ? 'monospace' : 'roman', bold = /bold/.test(outer), italic = /italic/.test(outer);
  if (name === 'textnormal') { family = 'roman'; bold = italic = false; }
  else if (name === 'textbf') bold = true;
  else if (name === 'textit' || name === 'textsl') italic = true;
  else if (name === 'emph') italic = !italic;
  else if (name === 'textup') italic = false;
  else if (name === 'textrm') family = 'roman';
  else if (name === 'textsf') family = 'sans-serif';
  else if (name === 'texttt') family = 'monospace';
  if (family === 'monospace') return 'monospace';
  const style = (bold ? '-bold' : '') + (italic ? '-italic' : '');
  return family === 'sans-serif' ? 'sans-serif' + style : style ? style.slice(1) : 'roman';
}
const MATH_TEX_TEXT_LETTERS = Object.freeze({ss: 'ß', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', o: 'ø', O: 'Ø', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł', i: 'ı', j: 'ȷ'});
const MATH_TEX_DECLARATIONS = Object.freeze({
  rm: {variant: 'roman'}, rmfamily: {variant: 'roman'}, normalfont: {variant: 'roman'},
  it: {variant: 'italic'}, itshape: {variant: 'italic'}, sl: {variant: 'italic'},
  bf: {variant: 'bold'}, bfseries: {variant: 'bold'}, sf: {variant: 'sans-serif'}, sffamily: {variant: 'sans-serif'},
  tt: {variant: 'monospace'}, ttfamily: {variant: 'monospace'}, cal: {variant: 'script'},
  displaystyle: {mathStyle: 'display'}, textstyle: {mathStyle: 'text'}, scriptstyle: {mathStyle: 'script'}, scriptscriptstyle: {mathStyle: 'scriptscript'},
  tiny: {absoluteSize: .5}, scriptsize: {absoluteSize: .7}, footnotesize: {absoluteSize: .8}, small: {absoluteSize: .9}, normalsize: {absoluteSize: 1},
  large: {absoluteSize: 1.2}, Large: {absoluteSize: 1.44}, LARGE: {absoluteSize: 1.728}, huge: {absoluteSize: 2.074}, Huge: {absoluteSize: 2.488}
});
const MATH_TEX_ACCENTS = Object.freeze({
  hat: ['̂', 'over'], widehat: ['̂', 'over', true], check: ['̌', 'over'], widecheck: ['̌', 'over', true],
  tilde: ['̃', 'over'], widetilde: ['̃', 'over', true], acute: ['́', 'over'], grave: ['̀', 'over'],
  breve: ['̆', 'over'], bar: ['̄', 'over'], vec: ['⃗', 'over'], dot: ['̇', 'over'], ddot: ['̈', 'over'],
  dddot: ['⃛', 'over'], ddddot: ['⃜', 'over'], mathring: ['̊', 'over'], ring: ['̊', 'over'],
  overline: ['¯', 'over', true], underline: ['_', 'under', true], overbrace: ['⏞', 'over', true], underbrace: ['⏟', 'under', true],
  overparen: ['⏜', 'over', true], underparen: ['⏝', 'under', true], overbracket: ['⎴', 'over', true], underbracket: ['⎵', 'under', true],
  overrightarrow: ['→', 'over', true], overleftarrow: ['←', 'over', true], overleftrightarrow: ['↔', 'over', true],
  underrightarrow: ['→', 'under', true], underleftarrow: ['←', 'under', true], underleftrightarrow: ['↔', 'under', true],
  overleftharpoon: ['↼', 'over', true], overrightharpoon: ['⇀', 'over', true], utilde: ['̃', 'under', true]
});
const MATH_TEX_LONG_ARROWS = {iff: 'Longleftrightarrow', implies: 'Longrightarrow', impliedby: 'Longleftarrow', And: 'And'};
// These unicode-math aliases do not expose a binary/relation mathchar to amsmath's raw-token lookahead.
const MATH_TEX_DOTS_LOW = new Set('circ bullet diamond lor land smallsetminus bigcirc dag ddag bigtriangledown le ge neq owns Join blacktriangleleft blacktriangleright therefore because coloneqq eqqcolon dblcolon gets to'.split(' '));
// mathtools: a colon or double colon joined to a relation, 1.2 mu apart.
const MATH_TEX_COLONS = {coloneq: '∶−', Coloneq: '∷−', Coloneqq: '∷=', Eqqcolon: '=∷', eqcolon: '−∶', Eqcolon: '−∷', colonapprox: '∶≈', Colonapprox: '∷≈', colonsim: '∶∼', Colonsim: '∷∼'};
// dvipsnames in CMYK percent (LaTeX graphics bundle), converted as xcolor does: each RGB channel is 1 − min(1, CMY + K).
// xcolor's base colors in RGB, for mixing.
const MATH_TEX_XCOLOR_BASE = Object.freeze(Object.fromEntries(Object.entries({red: [1, 0, 0], green: [0, 1, 0], blue: [0, 0, 1], cyan: [0, 1, 1], magenta: [1, 0, 1],
  yellow: [1, 1, 0], black: [0, 0, 0], white: [1, 1, 1], gray: [.5, .5, .5], darkgray: [.25, .25, .25], lightgray: [.75, .75, .75], brown: [.75, .5, .25],
  lime: [.75, 1, 0], olive: [.5, .5, 0], orange: [1, .5, 0], pink: [1, .75, .75], purple: [.75, 0, .25], teal: [0, .5, .5], violet: [.5, 0, .5]})
  .map(([name, rgb]) => [name, '#' + rgb.map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')])));
const MATH_TEX_DVIPSNAMES = Object.create(null), MATH_TEX_DVIPS_CMYK = Object.create(null);
for (const [, name, ...cmyk] of `GreenYellow 15 0 69 0 Yellow 0 0 100 0 Goldenrod 0 10 84 0 Dandelion 0 29 84 0 Apricot 0 32 52 0 Peach 0 50 70 0
Melon 0 46 50 0 YellowOrange 0 42 100 0 Orange 0 61 87 0 BurntOrange 0 51 100 0 Bittersweet 0 75 100 24 RedOrange 0 77 87 0 Mahogany 0 85 87 35
Maroon 0 87 68 32 BrickRed 0 89 94 28 Red 0 100 100 0 OrangeRed 0 100 50 0 RubineRed 0 100 13 0 WildStrawberry 0 96 39 0 Salmon 0 53 38 0
CarnationPink 0 63 0 0 Magenta 0 100 0 0 VioletRed 0 81 0 0 Rhodamine 0 82 0 0 Mulberry 34 90 0 2 RedViolet 7 90 0 34 Fuchsia 47 91 0 8
Lavender 0 48 0 0 Thistle 12 59 0 0 Orchid 32 64 0 0 DarkOrchid 40 80 20 0 Purple 45 86 0 0 Plum 50 100 0 0 Violet 79 88 0 0 RoyalPurple 75 90 0 0
BlueViolet 86 91 0 4 Periwinkle 57 55 0 0 CadetBlue 62 57 23 0 CornflowerBlue 65 13 0 0 MidnightBlue 98 13 0 43 NavyBlue 94 54 0 0 RoyalBlue 100 50 0 0
Blue 100 100 0 0 Cerulean 94 11 0 0 Cyan 100 0 0 0 ProcessBlue 96 0 0 0 SkyBlue 62 0 12 0 Turquoise 85 0 20 0 TealBlue 86 0 34 2 Aquamarine 82 0 30 0
BlueGreen 85 0 33 0 Emerald 100 0 50 0 JungleGreen 99 0 52 0 SeaGreen 69 0 50 0 Green 100 0 100 0 ForestGreen 91 0 88 12 PineGreen 92 0 59 25
LimeGreen 50 0 100 0 YellowGreen 44 0 74 0 SpringGreen 26 0 76 0 OliveGreen 64 0 95 40 RawSienna 0 72 100 45 Sepia 0 83 100 70 Brown 0 81 100 60
Tan 14 42 56 0 Gray 0 0 0 50 Black 0 0 0 100 White 0 0 0 0`.matchAll(/(\w+) (\d+) (\d+) (\d+) (\d+)/g))
  MATH_TEX_DVIPS_CMYK[name] = cmyk.map(value => value / 100), MATH_TEX_DVIPSNAMES[name] = '#' + cmyk.slice(0, 3).map(value => Math.round(255 * (1 - Math.min(1, (+value + +cmyk[3]) / 100))).toString(16).padStart(2, '0')).join('');
const MATH_TEX_SPACES = Object.freeze({
  ',': 3 / 18, ':': 4 / 18, ';': 5 / 18, '!': -3 / 18, ' ': 1 / 3,
  quad: 1, qquad: 2, enspace: .5, enskip: .5, thinspace: 3 / 18, medspace: 4 / 18, thickspace: 5 / 18,
  negthinspace: -3 / 18, negmedspace: -4 / 18, negthickspace: -5 / 18
});
const mathSITable = text => Object.freeze(Object.fromEntries(text.split(' ').map(entry => entry.split('='))));
const MATH_SI_UNITS = mathSITable('gram=g metre=m meter=m second=s ampere=A kelvin=K mole=mol candela=cd newton=N joule=J watt=W pascal=Pa hertz=Hz volt=V ohm=Ω coulomb=C farad=F henry=H tesla=T weber=Wb siemens=S celsius=°C degreeCelsius=°C litre=L liter=L electronvolt=eV degree=° percent=% minute=min hour=h day=d hectare=ha tonne=t becquerel=Bq gray=Gy sievert=Sv katal=kat lumen=lm lux=lx radian=rad steradian=sr arcminute=′ arcsecond=″ bar=bar angstrom=Å dalton=Da bel=B decibel=dB astronomicalunit=au atomicmassunit=u neper=Np');
// siunitx's abbreviated units (\km, \kHz, \uA...): prefix letters (u for micro) and a unit symbol.
const MATH_SI_ABBREVIATIONS = Object.freeze(Object.fromEntries(`f,p,n,u,m,,k:g p,n,u,m,c,d,,k:m a,f,p,n,u,m,:s f,p,n,u,m,,k:mol p,n,u,m,,k:A u,m,,h:L u,m,,h:l
,m,k,M,G,T:Hz m,,k,M:N ,k,M,G:Pa m,k,M:ohm p,n,u,m,,k:V u,m,,k,M,G:W u,m,,k:J ,m,k,M,G,T:eV k:Wh f,p,n,u,m,:F ,m:H n,u,m,:C ,m:T :K d:B`.split(/\s+/).flatMap(entry => {
  const [prefixes, unit] = entry.split(':'), symbol = {ohm: 'Ω', l: 'L'}[unit] || unit;
  return prefixes.split(',').map(prefix => [prefix + unit, (prefix === 'u' ? 'µ' : prefix) + symbol]);
}).filter(([name]) => name.length > 1 || /^[gmsAJLlVWNFHCTK]$/.test(name))));
const MATH_SI_PREFIXES = mathSITable('quecto=q ronto=r yocto=y zepto=z atto=a femto=f pico=p nano=n micro=µ milli=m centi=c deci=d deca=da deka=da hecto=h kilo=k mega=M giga=G tera=T peta=P exa=E zetta=Z yotta=Y ronna=R quetta=Q');
const MATH_TEX_PACKAGES = new Set(('ams amsmath amssymb amsfonts mathtools color newcommand unicode mhchem physics siunitx bbm bboldx dsfont cancel bbox boldsymbol').split(' '));
const MATH_TEX_PHYSICS = new Set('dv derivative pdv pderivative fdv functionalderivative dd differential qty quantity pqty bqty Bqty vqty abs absolutevalue norm bra ket braket innerproduct ip ketbra dyad outerproduct op expval expectationvalue ev mel matrixel matrixelement comm commutator acomm anticommutator pb poissonbracket vb va vu vectorbold vectorarrow vectorunit grad gradient divergence curl laplacian eval evaluated order Tr tr trace rank diag Res mqty pmqty bmqty Bmqty Pmqty vmqty smqty dmat diagonalmatrix admat antidiagonalmatrix imat identitymatrix zmat zeromatrix xmat xmatrix pmat paulimatrix qq qc qcc qif qthen qelse qotherwise qunless qgiven qusing qassume qsince qlet qfor qall qeven qodd qinteger qand qor qas qin'.split(' '));
const MATH_TEX_ENVIRONMENTS = new Set(('matrix pmatrix bmatrix Bmatrix vmatrix Vmatrix smallmatrix psmallmatrix bsmallmatrix Bsmallmatrix vsmallmatrix Vsmallmatrix array aligned alignedat align alignat flalign gathered lgathered rgathered gather split cases dcases rcases drcases subarray substack eqnarray multline multlined equation darray CD').split(' '));
const MATH_TABLE_DELIMITERS = Object.freeze({pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'], vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'], cases: ['{', ''], rcases: ['', '}']});
function mathTableDelimiters(environment) { return MATH_TABLE_DELIMITERS[environment.replace(/smallmatrix$/, 'matrix').replace(/^d(r?cases)$/, '$1')]; }
const MATH_ENCLOSE_NOTATIONS = new Set('box roundedbox circle left right top bottom horizontalstrike verticalstrike updiagonalstrike downdiagonalstrike updiagonalarrow longdiv actuarial madruwb radical phasorangle'.split(' '));
const MATH_TEX_LITERAL_CLASSES = Object.freeze({
  '+': 'bin', '−': 'bin', '-': 'bin', '±': 'bin', '∓': 'bin', '×': 'bin', '÷': 'bin', '*': 'bin', '⋅': 'bin',
  '=': 'rel', '<': 'rel', '>': 'rel', '≤': 'rel', '≥': 'rel', '≠': 'rel', ':': 'rel',
  '(': 'open', '[': 'open', '{': 'open', '⟨': 'open', ')': 'close', ']': 'close', '}': 'close', '⟩': 'close', ',': 'punct', ';': 'punct',
  '!': 'close',
  '∑': 'op', '∏': 'op', '∫': 'op', '∮': 'op', '∬': 'op', '∭': 'op'
});

function mathTexTokenText(tokens) {
  return tokens.map(token => token.kind === 'verbatim' ? '\\verb' + (token.starred ? '*' : '') + token.delimiter + token.value + token.delimiter :
    token.kind === 'command' ? '\\' + token.value + (/^[A-Za-z@]+$/.test(token.value) ? ' ' : '') : token.value).join('');
}
function mathChoice(node, context) { return node.choices[context.level ? Math.min(context.level + 1, 3) : context.display ? 0 : 1]; }
// Whether braces in a token run pair up without closing below their start.
function mathTexBalanced(tokens) {
  let depth = 0;
  for (const token of tokens) if (token.kind === 'char') { depth += token.value === '{' ? 1 : token.value === '}' ? -1 : 0; if (depth < 0) return false; }
  return depth === 0;
}
function mathTexTokenEqual(a, b) { return !!a && !!b && a.kind === b.kind && a.value === b.value; }

class MathTexParser {
  constructor(source, options = {}) {
    this.source = source;
    this.frames = [{tokens: options.tokens || mathTexTokens(source), at: 0}];
    this.scopes = options.scopes || [Object.create(null)];
    this.budget = options.budget || {nodes: 0, expansions: 0, expandedTokens: 0, depth: 0};
    this.fenceDepth = options.fenceDepth || 0;
    this.colors = options.colors || Object.create(null);
    this.eof = {kind: 'eof', value: '', offset: source.length};
  }
  error(code, message, token = this.rawPeek(), command) {
    throw new MathTexError(code, message, token.offset, command === undefined && token.kind === 'command' ? token.value : command || '');
  }
  node(type, fields = {}) {
    this.reserveParts(1);
    return {type, ...fields};
  }
  reserveParts(count, token) {
    // Peeking only on refusal: a skipping peek here would consume the spaces that \ce reads.
    if (!Number.isSafeInteger(count) || count < 0 || this.budget.nodes + count > 50000)
      this.error('resource-limit', 'This formula has too many parts to render safely.', token || this.rawPeek());
    this.budget.nodes += count;
  }
  row(children) { return this.node('row', {children: children.filter(Boolean)}); }
  rawPeek(skipSpace = true) {
    while (this.frames.length) {
      const frame = this.frames[this.frames.length - 1];
      if (frame.at >= frame.tokens.length) { this.frames.pop(); continue; }
      const token = frame.tokens[frame.at];
      if (skipSpace && token.kind === 'space') { frame.at++; continue; }
      return token;
    }
    return this.eof;
  }
  rawTake(skipSpace = true) {
    const token = this.rawPeek(skipSpace);
    if (token.kind !== 'eof') this.frames[this.frames.length - 1].at++;
    return token;
  }
  macro(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--)
      if (Object.hasOwn(this.scopes[i], name)) return this.scopes[i][name];
    return null;
  }
  peek(skipSpace = true) {
    for (;;) {
      const token = this.rawPeek(skipSpace);
      const macro = token.kind === 'command' && !token.builtin && this.macro(token.value);
      if (!macro) return token;
      this.rawTake(skipSpace);
      this.expand(macro, token);
    }
  }
  take(skipSpace = true) {
    const token = this.peek(skipSpace);
    return token.kind === 'eof' ? token : this.rawTake(skipSpace);
  }
  is(value) { return this.peek().value === value && this.peek().kind === 'char'; }
  commandIs(value) { const token = this.peek(); return token.kind === 'command' && token.value === value; }
  expect(value, kind = 'char') {
    const token = this.take();
    if (token.kind !== kind || token.value !== value) this.error('unexpected-token', 'Expected ' + (kind === 'command' ? '\\' : '') + value + '.', token);
    return token;
  }
  nested(fn) {
    if (++this.budget.depth > 192) this.error('resource-limit', 'This formula is nested too deeply to render safely.');
    this.scopes.push(Object.create(null));
    try { return fn(); }
    finally { this.scopes.pop(); this.budget.depth--; }
  }
  parse() {
    const result = this.parseRow(() => false);
    if (this.peek().kind !== 'eof') this.error('unexpected-token', 'Unexpected content after the formula.');
    return result;
  }
  parseRow(stop, allowFraction = true) {
    const children = [];
    for (;;) {
      const token = this.peek();
      if (token.kind === 'eof' || stop(token)) break;
      if (token.kind === 'command' && (Object.hasOwn(MATH_TEX_DECLARATIONS, token.value) || token.value === 'color')) {
        this.take();
        const fields = token.value === 'color' ? {color: this.readColor()} : MATH_TEX_DECLARATIONS[token.value];
        // A math style is an ordered list node: a selected mathchoice can change the style of later atoms.
        if (fields.mathStyle) { children.push(this.node('style', {...fields, declaration: true, body: this.row([])})); continue; }
        // A declaration styles each following atom; the atoms keep their own classes and spacing.
        const rest = this.nested(() => this.parseRow(stop, allowFraction));
        // The first one notes where the declaration stood: TeX keeps no italic correction across it.
        for (const [at, body] of (rest.type === 'row' ? rest.children : [rest]).entries()) children.push(this.styledDeclaration(fields, body, at === 0));
        break;
      }
      if (token.kind === 'command' && /^(over|atop|choose|brace|brack|above|overwithdelims|atopwithdelims|abovewithdelims)$/.test(token.value)) {
        if (!allowFraction) this.error('ambiguous-fraction', 'Put each infix fraction in its own group.', token);
        this.take();
        const name = token.value, fields = {num: this.row(children), den: null, bar: !/atop|choose|brace|brack/.test(name)};
        if (name.includes('withdelims')) { fields.left = this.readDelimiter(); fields.right = this.readDelimiter(); }
        else if (name === 'choose') { fields.left = '('; fields.right = ')'; }
        else if (name === 'brace') { fields.left = '{'; fields.right = '}'; }
        else if (name === 'brack') { fields.left = '['; fields.right = ']'; }
        if (name.startsWith('above')) { fields.barThickness = this.readDimension(); fields.bar = fields.barThickness !== 0; }
        fields.den = this.parseRow(stop, false);
        return this.row([this.node('frac', fields)]);
      }
      if (token.kind === 'char' && (token.value === '^' || token.value === '_' || token.value === "'")) {
        let base = children.pop() || this.row([]);
        if (base.type === 'choice' || base.type === 'style' && base.mathStyle && base.declaration && !base.body.children.length) { children.push(base); base = this.row([]); }
        children.push(this.readScripts(base));
        continue;
      }
      if (token.kind === 'command' && /^(limits|nolimits|displaylimits)$/.test(token.value)) {
        this.take();
        const base = children[children.length - 1];
        if (!base) this.error('missing-operator', '\\' + token.value + ' needs an operator.', token);
        base.limits = token.value === 'limits' ? 'always' : token.value === 'nolimits' ? 'never' : 'display';
        continue;
      }
      const atom = this.parseAtom();
      // A symbol remembers where its source begins, so a tap on it can find its place in the source.
      if (atom && (atom.type === 'glyph' || atom.type === 'text') && atom.at === undefined) atom.at = token.offset;
      if (atom) children.push(atom.type === 'choice' ? atom : this.readScripts(atom));
    }
    // An equation tag follows its equation wherever \tag was written.
    const tags = children.filter(child => child?.semanticRole === 'tag');
    return this.row(tags.length ? [...children.filter(child => child?.semanticRole !== 'tag'), ...tags] : children);
  }
  styledDeclaration(fields, body, first) {
    // Font/color assignments are group-local; math-style nodes remain in the list even through these assignments.
    if (body.type === 'style' && body.mathStyle && body.declaration) return body;
    if (body.type === 'choice') {
      for (const branch of body.choices) branch.children = branch.children.map((child, index) => this.styledDeclaration(fields, child, first && index === 0));
      return body;
    }
    return this.node('style', {...fields, body, ...(first ? {declaration: true} : {})});
  }
  readScripts(base) {
    let result = base;
    for (;;) {
      const token = this.peek();
      if (token.kind === 'command' && /^(limits|nolimits|displaylimits)$/.test(token.value)) {
        this.take();
        result.limits = token.value === 'limits' ? 'always' : token.value === 'nolimits' ? 'never' : 'display';
        continue;
      }
      if (token.kind !== 'char' || !['_', '^', "'"].includes(token.value)) break;
      this.take();
      if (result.type !== 'scripts') result = this.node('scripts', {base: result, limits: result.limits});
      const key = token.value === '_' ? 'sub' : 'sup';
      if (token.value === "'") {
        // Runs of primes use the font's joined double, triple and quadruple prime glyphs.
        let count = 1;
        while (this.is("'")) { this.take(); count++; }
        const primes = [];
        for (; count > 0; count -= 4) primes.push(this.node('glyph', {value: '′″‴⁗'[Math.min(count, 4) - 1], class: 'ord', variant: 'roman'}));
        if (this.is('^')) { this.take(); primes.push(this.argument()); }
        if (result.sup) this.error('duplicate-script', 'A base cannot have two superscripts.', token);
        result.sup = this.row(primes);
      } else {
        if (result[key]) this.error('duplicate-script', 'A base cannot have two ' + (key === 'sub' ? 'subscripts' : 'superscripts') + '.', token);
        result[key] = this.argument();
      }
    }
    return result;
  }
  argument() {
    if (++this.budget.depth > 192) this.error('resource-limit', 'This formula is nested too deeply to render safely.');
    try { return this.argumentValue(); }
    finally { this.budget.depth--; }
  }
  argumentValue() {
    const token = this.peek();
    if (token.kind === 'eof' || (token.kind === 'char' && ['}', '^', '_', '&'].includes(token.value)))
      this.error('missing-argument', 'A mathematical argument is missing.', token);
    if (this.is('{')) {
      this.take();
      return this.nested(() => {
        const body = this.parseRow(item => item.kind === 'char' && item.value === '}');
        // An empty argument remembers the place inside its braces, so a tap can put the caret there.
        if (body.type === 'row' && !body.children.length) body.at = token.offset + 1;
        this.expect('}');
        return body;
      });
    }
    const atom = this.parseAtom();
    if (!atom) this.error('missing-argument', 'An argument must contain a mathematical expression.', token);
    if ((atom.type === 'glyph' || atom.type === 'text') && atom.at === undefined) atom.at = token.offset;
    return atom;
  }
  rawArgument() {
    const first = this.rawTake();
    if (first.kind === 'eof') this.error('missing-argument', 'A command argument is missing.', first);
    if (first.kind !== 'char' || first.value !== '{') return [first];
    const result = [];
    let depth = 1;
    while (depth) {
      const token = this.rawTake(false);
      if (token.kind === 'eof') this.error('unclosed-group', 'A closing brace is missing.', first);
      if (token.kind === 'char' && token.value === '{') depth++;
      if (token.kind === 'char' && token.value === '}') depth--;
      if (depth > 192) this.error('resource-limit', 'This argument is nested too deeply.', token);
      if (depth) result.push(token);
    }
    return result;
  }
  optionalRaw() {
    if (this.rawPeek().kind !== 'char' || this.rawPeek().value !== '[') return null;
    const start = this.rawTake(), result = [];
    let braces = 0;
    for (;;) {
      const token = this.rawTake(false);
      if (token.kind === 'eof') this.error('unclosed-option', 'A closing bracket is missing.', start);
      if (token.kind === 'char') {
        if (token.value === ']' && !braces) break;
        if (token.value === '{') braces++;
        if (token.value === '}') braces--;
        if (braces < 0) this.error('unclosed-option', 'An option ended before its closing bracket.', token);
      }
      result.push(token);
    }
    return result;
  }
  subparse(tokens, text = false, variant = 'roman') {
    return this.nested(() => {
      const parser = new MathTexParser(this.source, {tokens, scopes: this.scopes, budget: this.budget, fenceDepth: this.fenceDepth, colors: this.colors});
      return text ? parser.parseText(variant) : parser.parse();
    });
  }
  plainArgument() {
    return mathTexTokenText(this.rawArgument()).trim();
  }
  literal(value, fields = {}) {
    return this.node('glyph', {value: value === '-' ? '−' : value === '*' ? '∗' : value, class: MATH_TEX_LITERAL_CLASSES[value] || 'ord', ...fields});
  }
  parseAtom() {
    const token = this.take();
    if (token.kind === 'eof') this.error('missing-argument', 'A mathematical expression is missing.', token);
    if (token.kind === 'verbatim') return this.readVerb(token);
    if (token.kind === 'command') return this.command(token);
    if (token.value === '{') {
      return this.nested(() => {
        const body = this.parseRow(item => item.kind === 'char' && item.value === '}');
        this.expect('}');
        // TeX makes a braced group in a formula one ordinary atom, whatever it holds: a{=}b has no relation spaces.
        body.group = true;
        return body;
      });
    }
    if (token.value === '}') this.error('unexpected-brace', 'A closing brace has no opening brace.', token);
    if (token.value === '&') this.error('unexpected-alignment', 'An alignment tab needs a matrix or aligned environment.', token);
    if (token.value === '#') this.error('unexpected-parameter', 'A macro parameter is outside a macro definition.', token);
    if (token.value === '$') this.error('unexpected-delimiter', 'A math delimiter is inside the formula.', token);
    if (token.value === '~') return this.node('space', {width: 1 / 3});
    if (/^[\u0000-\u001f\u007f]$/.test(token.value)) this.error('invalid-character', 'A control character cannot be typeset.', token);
    return this.literal(token.value, /[∑∏∫∮∬∭]/.test(token.value) ? {large: true, limits: /[∫∮∬∭]/.test(token.value) ? 'never' : 'display'} : {});
  }
  readDelimiter() {
    const token = this.take();
    if (token.kind === 'command') {
      if (token.value === '{' || token.value === '}') return token.value;
      if (token.value === '|') return '‖';
      const symbol = Object.hasOwn(MATH_SYMBOLS, token.value) ? MATH_SYMBOLS[token.value] : null;
      if (symbol && (['open', 'close'].includes(symbol.class) || /^(vert|Vert|backslash|slash|[uUdD].*arrow)$/.test(token.value))) return symbol.value;
    }
    if (token.kind === 'char' && '.()[]{}|/<>‖⌈⌉⌊⌋⟨⟩↑↓↕⇑⇓⇕'.includes(token.value))
      return token.value === '.' ? '' : token.value === '<' ? '⟨' : token.value === '>' ? '⟩' : token.value;
    this.error('invalid-delimiter', 'Expected a mathematical delimiter.', token);
  }
  command(token) {
    const name = token.value;
    if (name === 'mathchoice') return this.node('choice', {choices: Array.from({length: 4}, () => {
      if (!this.is('{')) this.error('missing-argument', 'Each math choice needs a braced expression.');
      return this.argument();
    })});
    if (Object.hasOwn(MATH_TEX_SPACES, name)) return this.node('space', {width: MATH_TEX_SPACES[name]});
    // amsmath: \iff, \implies and \impliedby are a long double arrow between thick spaces, one relation.
    if (Object.hasOwn(MATH_TEX_LONG_ARROWS, name)) return this.node('style', {class: 'rel', body: this.row([this.node('space', {width: 5 / 18}), this.node('glyph', MATH_SYMBOLS[MATH_TEX_LONG_ARROWS[name]]), this.node('space', {width: 5 / 18})])});
    if (/^dots[bcimo]?$/.test(name)) return this.readDots(name);
    // amsmath's \colon: a colon 2 mu after the left side and 6 mu before the right, with no punctuation space.
    if (name === 'colon') return this.row([this.node('space', {width: 2 / 18}), this.node('glyph', {value: ':', class: 'ord', variant: 'roman', tokenKind: 'mo'}), this.node('space', {width: 6 / 18})]);
    if (Object.hasOwn(MATH_SYMBOLS, name)) return this.node('glyph', MATH_SYMBOLS[name]);
    if (Object.hasOwn(MATH_TEX_VARIANTS, name)) {
      let body = this.argument();
      // amsmath's \boldsymbol and \pmb, and bm's \bm, keep one symbol's class (\binrel@); a plain group is ordinary.
      if (/^(boldsymbol|bm|pmb)$/.test(name) && body.type === 'row' && body.children.length === 1 && body.children[0].type === 'glyph') body = body.children[0];
      return this.node('style', {variant: MATH_TEX_VARIANTS[name], body});
    }
    if (Object.hasOwn(MATH_TEX_TEXT_VARIANTS, name)) return this.subparse(this.rawArgument(), true, MATH_TEX_TEXT_VARIANTS[name]);
    if (MATH_NAMED_OPERATORS.has(name) || MATH_LIMIT_OPERATORS.has(name)) {
      const values = {limsup: 'lim\u2009sup', liminf: 'lim\u2009inf', injlim: 'inj\u2009lim', projlim: 'proj\u2009lim', varlimsup: 'lim', varliminf: 'lim', varinjlim: 'lim', varprojlim: 'lim'};
      let body = this.node('text', {value: values[name] || name, class: 'op', limits: MATH_LIMIT_OPERATORS.has(name) ? 'display' : 'never', variant: 'roman'});
      // amsmath's \injlim and \projlim are the words inj lim and proj lim; the var forms draw an arrow under lim.
      if (['varinjlim', 'varprojlim'].includes(name)) body = this.node('accent', {base: body, value: /inj/.test(name) ? '→' : '←', position: 'under', stretch: true, class: 'op', limits: 'display', varlim: true});
      if (name === 'varlimsup' || name === 'varliminf') body = this.node('accent', {base: body, value: '¯', position: name === 'varlimsup' ? 'over' : 'under', stretch: true, class: 'op', limits: 'display', varlim: true});
      return body;
    }
    if (Object.hasOwn(MATH_TEX_ACCENTS, name)) {
      const [value, position, stretch] = MATH_TEX_ACCENTS[name];
      // mathtools' \overbracket[rule][height]{...}: the font's bracket keeps its own rule and height.
      if (/bracket$/.test(name) && this.optionalRaw()) this.optionalRaw();
      // TeX's braces, parentheses and brackets over or under a formula are operators with limits.
      return this.node('accent', {base: this.argument(), value, position, stretch, ...(/(brace|paren|bracket)$/.test(name) ? {limits: 'always'} : {})});
    }
    if (/^[{}%$&#_]$/.test(name)) return this.literal(name, {variant: 'roman'});
    if (name === '|') return this.literal('‖', {variant: 'roman'});
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
      const align = name === 'cfrac' ? this.optionalRaw() : null;
      if (align && !/^[lr]$/.test(mathTexTokenText(align).trim())) this.error('invalid-option', 'Continued-fraction alignment must be l or r.', token);
      return this.node('frac', {num: this.argument(), den: this.argument(), bar: true, ...(name === 'dfrac' || name === 'cfrac' ? {style: 'display'} : name === 'tfrac' ? {style: 'text'} : {}), ...(align ? {align: mathTexTokenText(align).trim()} : {}), ...(name === 'cfrac' ? {strut: true} : {})});
    }
    if (/^(binom|dbinom|tbinom)$/.test(name)) return this.node('frac', {num: this.argument(), den: this.argument(), bar: false, left: '(', right: ')', textDelimiters: true, ...(name[0] === 'd' ? {style: 'display'} : name[0] === 't' ? {style: 'text'} : {})});
    if (name === 'genfrac') {
      const left = this.delimiterArgument(), right = this.delimiterArgument(), thickness = this.plainArgument(), style = this.plainArgument();
      if (!/^[0-3]?$/.test(style)) this.error('invalid-style', 'The fraction style must be 0, 1, 2 or 3.', token);
      const barThickness = thickness ? this.dimension(thickness, token) : undefined;
      return this.node('frac', {num: this.argument(), den: this.argument(), bar: barThickness !== 0, left, right, textDelimiters: true, ...(barThickness === undefined ? {} : {barThickness}), ...(style ? {style: ['display', 'text', 'script', 'scriptscript'][Number(style)]} : {})});
    }
    if (name === 'sqrt') {
      const index = this.optionalRaw();
      return this.node('root', {body: this.argument(), ...(index ? {index: this.subparse(index)} : {})});
    }
    if (name === 'root') {
      const index = this.parseRow(item => item.kind === 'command' && item.value === 'of');
      this.expect('of', 'command');
      return this.node('root', {body: this.argument(), index});
    }
    if (name === 'left') {
      const left = this.readDelimiter();
      this.fenceDepth++;
      try {
        const body = this.nested(() => this.parseRow(item => item.kind === 'command' && item.value === 'right'));
        this.expect('right', 'command');
        return this.node('fence', {left, right: this.readDelimiter(), body});
      } finally { this.fenceDepth--; }
    }
    if (name === 'middle') {
      if (!this.fenceDepth) this.error('unexpected-delimiter', '\\middle needs an enclosing \\left and \\right.', token);
      const value = this.readDelimiter();
      return value ? this.literal(value, {class: 'rel', delimiter: true, variant: 'roman'}) : this.row([]);
    }
    if (/^(big|Big|bigg|Bigg)[lrm]?$/.test(name)) {
      const value = this.delimiterArgument(), sizes = {big: 1.2, Big: 1.8, bigg: 2.4, Bigg: 3};
      const base = name.replace(/[lrm]$/, '');
      return this.literal(value, {delimiterSize: sizes[base], class: name.endsWith('l') ? 'open' : name.endsWith('r') ? 'close' : name.endsWith('m') ? 'rel' : 'ord', variant: 'roman'});
    }
    if (name === 'begin') return this.environment(this.plainArgument(), token);
    if (name === 'substack') return this.tableFromTokens(this.rawArgument(), 'substack');
    if (/^(matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|cases|smallmatrix)$/.test(name)) return this.tableFromTokens(this.rawArgument(), name);
    if (name === 'operatorname' || name === 'operatornamewithlimits') {
      const starred = name !== 'operatorname' || this.is('*'); if (starred && name === 'operatorname') this.take();
      // The name is set in math mode, where TeX ignores spaces: \operatorname{arg max} is argmax.
      const body = this.subparse(this.rawArgument().filter(token => token.kind !== 'space'), true, 'roman');
      return this.node('style', {body, variant: 'roman', class: 'op', limits: starred ? 'display' : 'never', operatorName: true});
    }
    if (/^math(ord|op|bin|rel|open|close|punct|inner)$/.test(name)) return this.node('style', {body: this.argument(), class: name.slice(4), ...(name === 'mathop' ? {limits: 'display'} : {})});
    // Plain TeX's \buildrel top \over relation is \stackrel{top}{relation}.
    if (name === 'buildrel') {
      const top = [];
      for (let depth = 0, item = this.rawTake(false); !(depth === 0 && item.kind === 'command' && item.value === 'over'); item = this.rawTake(false)) {
        if (item.kind === 'eof') this.error('missing-argument', '\\buildrel needs \\over.', token);
        if (item.kind === 'char' && item.value === '{') depth++;
        if (item.kind === 'char' && item.value === '}') depth--;
        top.push(item);
      }
      return this.node('overunder', {base: this.argument(), over: this.subparse(top), class: 'rel'});
    }
    if (name === 'overset' || name === 'underset' || name === 'stackrel' || name === 'stackbin') {
      const decoration = this.argument(), base = this.argument();
      return this.node('overunder', {base, [name === 'underset' ? 'under' : 'over']: decoration, ...(name === 'stackrel' ? {class: 'rel'} : name === 'stackbin' ? {class: 'bin'} : {})});
    }
    if (name === 'overunderset') { const over = this.argument(), under = this.argument(); return this.node('overunder', {base: this.argument(), over, under}); }
    if (/^x(leftarrow|rightarrow|leftrightarrow|Leftarrow|Rightarrow|Leftrightarrow|mapsto|hookleftarrow|hookrightarrow|leftharpoonup|leftharpoondown|rightharpoonup|rightharpoondown|rightleftharpoons|leftrightharpoons|twoheadleftarrow|twoheadrightarrow|longequal)$/.test(name)) {
      const under = this.optionalRaw(), over = this.argument(), symbol = name === 'xlongequal' ? '=' : MATH_SYMBOLS[name.slice(1)].value;
      return this.node('overunder', {base: this.literal(symbol, {class: 'rel', stretch: true}), over, ...(under ? {under: this.subparse(under)} : {}), class: 'rel', arrow: name.slice(1)});
    }
    if (name === 'not') {
      const base = this.argument(), negated = {'=': '≠', '<': '≮', '>': '≯', '≤': '≰', '≥': '≱', '∈': '∉', '∋': '∌', '⊂': '⊄', '⊃': '⊅', '⊆': '⊈', '⊇': '⊉', '∣': '∤', '∥': '∦', '∼': '≁', '≈': '≉', '≡': '≢', '→': '↛', '←': '↚', '↔': '↮', '⇒': '⇏', '⇐': '⇍', '⇔': '⇎'};
      if (base.type === 'glyph' && negated[base.value]) return this.literal(negated[base.value], {class: base.class, variant: 'roman'});
      return this.node('accent', {base, value: '̸', position: 'over', overlay: true, class: 'rel'});
    }
    if (name === 'phantom' || name === 'hphantom' || name === 'vphantom') return this.node('phantom', {body: this.argument(), mode: name[0] === 'h' ? 'h' : name[0] === 'v' ? 'v' : 'both'});
    if (name === 'smash') {
      const option = this.optionalRaw(), mode = option ? mathTexTokenText(option).trim() : '';
      if (option && mode !== 't' && mode !== 'b') this.error('invalid-option', 'A smash option must be t or b.', token);
      return this.node('smash', {body: this.argument(), ...(mode ? {mode} : {})});
    }
    if (name === 'mathstrut' || name === 'strut') return this.node('phantom', {body: this.literal('('), mode: 'v'});
    if (name === 'rlap' || name === 'llap' || name === 'clap' || name === 'mathrlap' || name === 'mathllap' || name === 'mathclap')
      return this.node('style', {body: this.argument(), width: 0, align: name.includes('rlap') ? 'left' : name.includes('llap') ? 'right' : 'center'});
    if (name === 'hspace' || name === 'mspace') {
      if (this.is('*')) this.take();
      return this.node('space', {width: this.dimension(this.plainArgument(), token)});
    }
    if (['kern', 'mkern', 'hskip', 'mskip'].includes(name)) return this.node('space', {width: this.readDimension()});
    if (name === 'rule') {
      const raise = this.optionalRaw(), width = this.dimension(this.plainArgument(), token), height = this.dimension(this.plainArgument(), token);
      const body = this.node('rule', {width, height, depth: 0});
      return raise ? this.node('raise', {body, amount: this.dimension(mathTexTokenText(raise), token)}) : body;
    }
    if (name === 'raisebox') {
      const amount = this.dimension(this.plainArgument(), token), height = this.optionalRaw(), depth = this.optionalRaw();
      return this.node('raise', {body: this.subparse(this.rawArgument(), true, 'roman'), amount, ...(height ? {height: this.dimension(mathTexTokenText(height), token)} : {}), ...(depth ? {depth: this.dimension(mathTexTokenText(depth), token)} : {})});
    }
    if (name === 'raise' || name === 'lower') return this.node('raise', {amount: this.readDimension() * (name === 'lower' ? -1 : 1), body: this.argument()});
    if (name === 'textcolor' || name === 'mathcolor') { const color = this.readColor(); return this.node('style', {body: this.argument(), color}); }
    if (name === 'colorbox' || name === 'fcolorbox') {
      const border = name === 'fcolorbox' ? this.readColor() : undefined, background = this.readColor();
      return this.node('style', {body: this.subparse(this.rawArgument(), true, 'roman'), background, ...(border ? {border} : {})});
    }
    if (name === 'definecolor') {
      const colorName = this.plainArgument(), model = this.plainArgument(), value = this.plainArgument();
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(colorName)) this.error('invalid-color', 'Invalid color name.', token);
      this.colors[colorName] = this.color(value, model, token); return null;
    }
    // MathJax's bbox: a background colour, a padding length and a CSS border whose last word is its colour.
    if (name === 'bbox') {
      const fields = {padding: 0}, options = this.optionalRaw();
      for (const option of options ? mathTexTokenText(options).split(',') : []) {
        const value = option.trim(), border = /^border\s*:(.*)$/i.exec(value);
        if (border) fields.border = this.color(border[1].trim().split(/\s+/).pop(), '', token);
        else if (/^[+-]?[\d.]/.test(value)) fields.padding = this.dimension(value, token);
        else if (value) fields.background = this.color(value, '', token);
      }
      return this.node('style', {body: this.argument(), ...fields});
    }
    if (name === 'intertext' || name === 'multicolumn' || name === 'hdotsfor')
      this.error('misplaced-alignment', name === 'intertext' ? '\\intertext goes at the start of a row of align, alignat, flalign or gather.' : '\\' + name + ' fills a whole cell of a matrix or array.', token);
    // MathJax's \enclose{notation}[attributes]{body}: MathML's menclose notations, with mathcolor and mathbackground.
    if (name === 'enclose') {
      const notation = this.plainArgument().split(/[\s,]+/).filter(Boolean), options = this.optionalRaw();
      if (!notation.length) this.error('missing-argument', '\\enclose needs a notation.', token);
      for (const item of notation) if (!MATH_ENCLOSE_NOTATIONS.has(item)) this.error('unsupported-notation', 'Unsupported enclose notation: ' + item + '.', token);
      const fields = {};
      for (const pair of options ? mathTexTokenText(options).split(',') : []) {
        const [key, value = ''] = pair.split('=').map(part => part.trim());
        if (key === 'mathcolor' || key === 'mathbackground') fields[key === 'mathcolor' ? 'color' : 'background'] = this.color(value, '', token);
      }
      return this.node('enclose', {notation: [...new Set(notation)], body: this.argument(), ...fields});
    }
    if (name === 'boxed' || name === 'fbox') return this.node('style', {body: name === 'fbox' ? this.subparse(this.rawArgument(), true, 'roman') : this.argument(), border: 'currentColor', padding: .25});
    if (name === 'cancel' || name === 'bcancel' || name === 'xcancel' || name === 'sout') return this.node('accent', {base: this.argument(), value: name === 'bcancel' ? '╲' : name === 'xcancel' ? '╳' : name === 'sout' ? '─' : '╱', position: 'over', overlay: true, stretch: true});
    if (name === 'cancelto') { const over = this.argument(); return this.node('overunder', {base: this.node('accent', {base: this.argument(), value: '↗', position: 'over', overlay: true, stretch: true}), over}); }
    if (['newcommand', 'renewcommand', 'providecommand', 'def', 'gdef', 'edef', 'xdef', 'DeclareMathOperator', 'DeclarePairedDelimiter', 'let'].includes(name)) { this.define(name, token); return null; }
    // Assignment prefixes: \global makes the next definition global; \long and \outer change nothing here.
    if (name === 'global' || name === 'long' || name === 'outer') {
      let next = token, global = false;
      while (next.kind === 'command' && /^(global|long|outer)$/.test(next.value)) { global ||= next.value === 'global'; next = this.rawTake(); }
      if (next.kind !== 'command' || !/^[egx]?def$/.test(next.value)) this.error('invalid-macro', '\\' + name + ' needs a \\def.', token);
      this.define(global ? {def: 'gdef', edef: 'xdef'}[next.value] || next.value : next.value, next); return null;
    }
    if (name === 'require') {
      const value = this.plainArgument();
      if (!MATH_TEX_PACKAGES.has(value)) this.error('unsupported-package', 'Unsupported math package: ' + value + '.', token, name);
      return null;
    }
    if (name === 'href') {
      const href = this.readLink(token);
      return this.node('link', {href, body: this.argument()});
    }
    if (name === 'url') {
      const href = this.readLink(token);
      return this.node('link', {href, body: this.node('text', {value: href, variant: 'monospace'})});
    }
    if (name === 'label') { this.plainArgument(); return null; }
    if (['notag', 'nonumber', 'relax', 'allowbreak', 'nobreak', 'protect', 'displaystylelimits'].includes(name)) return null;
    if (name === 'tag') {
      const starred = this.is('*'); if (starred) this.take();
      const body = this.subparse(this.rawArgument(), true);
      return {...this.row([this.node('space', {width: 2}), starred ? body : this.node('fence', {left: '(', right: ')', body})]), semanticRole: 'tag'};
    }
    if (Object.hasOwn(MATH_TEX_COLONS, name))
      return this.node('style', {class: 'rel', body: this.row([...MATH_TEX_COLONS[name]].flatMap((value, i) => [...(i ? [this.node('space', {width: -1.2 / 18})] : []), this.literal(value, {class: 'ord', variant: 'roman'})]))});
    const make = (value, kind = 'command') => ({kind, value, offset: token.offset});
    // mathtools: \cmd{x} keeps the declared delimiters' size, \cmd*{x} stretches them and \cmd[\big]{x} sets it.
    if (name === '@paired') {
      const left = this.rawArgument(), right = this.rawArgument(), starred = this.is('*');
      if (starred) this.take();
      const size = starred ? null : this.optionalRaw()?.filter(item => item.kind !== 'space'), body = this.rawArgument();
      if (size && (size.length !== 1 || !/^(big|Big|bigg|Bigg)$/.test(size[0].value))) this.error('invalid-option', 'A delimiter size must be \\big, \\Big, \\bigg or \\Bigg.', token);
      const group = tokens => [make('{', 'char'), ...tokens, make('}', 'char')];
      return this.subparse(starred ? [make('left'), ...left, ...body, make('right'), ...right] : size ? [make(size[0].value + 'l'), ...left, ...group(body), make(size[0].value + 'r'), ...right] :
        [make('mathopen'), ...group(left), ...group(body), make('mathclose'), ...group(right)]);
    }
    // braket: \Bra, \Ket, \Braket and \Set stretch their delimiters; bars inside \Braket, and the first in \Set and \set, divide.
    if (/^(Bra|Ket|Braket|Set|set)$/.test(name)) {
      const [left, right] = {Bra: ['langle', '|'], Ket: ['|', 'rangle'], Braket: ['langle', 'rangle'], Set: ['{', '}'], set: ['{', '}']}[name], body = [];
      const raw = this.rawArgument(), delimiter = value => value === '|' ? make('|', 'char') : make(value);
      let divided = false;
      for (let i = 0; i < raw.length; i++) {
        // braket.sty reads || and \| as one double bar.
        const item = raw[i], command = name !== 'set' && item.kind === 'command' && item.value === '|', bar = command || item.kind === 'char' && item.value === '|',
          double = command || bar && raw[i + 1]?.kind === 'char' && raw[i + 1].value === '|';
        if (!bar || divided || (name !== 'Braket' && name !== 'Set' && name !== 'set')) { body.push(item); continue; }
        if (double && !command) i++;
        divided = name !== 'Braket';
        body.push(...(name === 'set' ? [make('mid')] : [make(name === 'Set' ? ';' : ','), make('middle'), double ? make('|') : make('|', 'char'), make(name === 'Set' ? ';' : ',')]));
      }
      if (name === 'set') return this.subparse([make('{'), make(','), ...body, make(','), make('}')]);
      // braket.sty pads \Set with a medium space inside its braces.
      return this.subparse([make('left'), delimiter(left), ...(name === 'Set' ? [make(':')] : []), ...body, ...(name === 'Set' ? [make(':')] : []), make('right'), delimiter(right)]);
    }
    // units' \nicefrac (and xfrac's \sfrac): a script numerator raised 0.5 ex, a solidus, a script denominator lowered 0.25 ex.
    if (name === 'nicefrac' || name === 'sfrac') {
      const script = body => this.node('style', {mathStyle: 'script', body}), num = this.argument(), den = this.argument();
      return this.row([this.node('raise', {amount: .225, body: script(num)}), this.node('space', {width: -.1}), this.literal('/'), this.node('space', {width: -.15}), this.node('raise', {amount: -.1125, body: script(den)})]);
    }
    if (name === 'vcenter') return this.node('raise', {body: this.argument(), center: true});
    // mathtools \prescript{sup}{sub}{base}: scripts before the base, right aligned, at the base's height.
    if (name === 'prescript') {
      const sup = this.argument(), sub = this.argument(), base = this.argument();
      return this.row([this.node('scripts', {base: this.node('phantom', {body: base, mode: 'v'}), sup, sub, pre: true}), base]);
    }
    // amsmath \sideset{_a^b}{_c^d}\sum: corner scripts beside the operator; later scripts become its limits.
    if (name === 'sideset') {
      const before = this.argument(), after = this.argument(), op = this.argument(), corners = (side, base) => {
        const scripts = side.type === 'row' && side.children.length === 1 ? side.children[0] : side;
        return scripts.type === 'scripts' ? {...scripts, base} : this.row([base, side]);
      };
      return this.node('style', {class: 'op', limits: 'display', body: this.row([corners(before, this.node('phantom', {body: op, mode: 'v'})), corners(after, {...op, limits: 'never'})])});
    }
    // accents.sty: \accentset sets any symbol over its base; \underaccent sets an accent or symbol under it.
    if (name === 'accentset' || name === 'underaccent') {
      const mark = this.rawArgument().filter(item => item.kind !== 'space');
      if (mark.length === 1 && mark[0].kind === 'command' && Object.hasOwn(MATH_TEX_ACCENTS, mark[0].value)) {
        const [value, , stretch] = MATH_TEX_ACCENTS[mark[0].value];
        return this.node('accent', {base: this.argument(), value, position: name === 'accentset' ? 'over' : 'under', stretch});
      }
      const decoration = this.subparse(mark);
      return this.node('overunder', {base: this.argument(), [name === 'accentset' ? 'over' : 'under']: decoration, accentGap: true});
    }
    if (name === 'slashed') return this.node('accent', {base: this.argument(), value: '/', position: 'through'});
    if (name === 'bmod') return this.row([this.node('space', {width: 5 / 18}), this.node('text', {value: 'mod', variant: 'roman', class: 'bin'}), this.node('space', {width: 5 / 18})]);
    if (name === 'mod' || name === 'pmod' || name === 'pod') return this.row([
      this.node('space', {width: (name === 'mod' ? 12 : 8) / 18, displayWidth: 1}),
      ...(name === 'mod' ? [] : [this.literal('(')]),
      ...(name === 'pod' ? [] : [this.node('text', {value: 'mod', variant: 'roman'}), this.node('space', {width: 1 / 3})]),
      this.argument(), ...(name === 'mod' ? [] : [this.literal(')')])
    ]);
    if (name === 'ce') return {...this.chemistry(this.rawArgument()), semanticRole: 'chemistry'};
    if (name === 'pu') return {...this.units(this.rawArgument()), semanticRole: 'units'};
    if (/^(SI|si|num|unit|ang|SIrange|numrange|qtyrange)$/.test(name)) return {...this.siunitx(name, token), semanticRole: 'units'};
    // mathtools \smashoperator[lr]{op}: the limits overhang the operator's own width on the named sides.
    if (name === 'smashoperator') {
      const sides = mathTexTokenText(this.optionalRaw() || []).trim() || 'lr';
      if (!/^(l|r|lr|rl)$/.test(sides)) this.error('invalid-option', 'A smashed operator side must be l, r or lr.', token);
      return this.node('style', {body: this.argument(), smashOperator: sides});
    }
    if (name === 'mathmakebox') {
      const width = this.optionalRaw(), position = mathTexTokenText(this.optionalRaw() || []).trim() || 'c';
      if (!/^[lrcs]$/.test(position)) this.error('invalid-option', 'A box position must be l, r, c or s.', token);
      const body = this.argument();
      return width ? this.node('style', {body, width: this.dimension(mathTexTokenText(width), token), align: {l: 'left', r: 'right'}[position] || 'center'}) : body;
    }
    // amsmath \idotsint: two integral signs joined by centred dots, one operator.
    if (name === 'idotsint') {
      const integral = () => this.literal('∫', {large: true, limits: 'never', class: 'op'});
      return this.node('style', {class: 'op', limits: 'never', body: this.row([integral(), this.node('space', {width: -1 / 6}), this.node('glyph', MATH_SYMBOLS.cdots), this.node('space', {width: -1 / 6}), integral()])});
    }
    if (MATH_TEX_PHYSICS.has(name)) return {...this.physics(name, token), semanticRole: 'physics'};
    if (name === 'mmlToken') return this.mathmlToken(token);
    if (name === 'unicode' || name === 'char') return this.character(name, token);
    if (name === 'TeX' || name === 'LaTeX') return this.node('text', {value: name, variant: 'roman'});
    if (name === 'textbackslash') return this.literal('\\', {variant: 'roman'});
    if (name === 'textasciitilde') return this.literal('~', {variant: 'roman'});
    if (name === 'textasciicircum') return this.literal('^', {variant: 'roman'});
    if (['end', 'right', '\\', 'cr', 'of'].includes(name)) this.error('unexpected-command', '\\' + name + ' has no matching opening command.', token);
    this.error('unsupported-command', 'Unsupported math command: \\' + name + '.', token);
  }

  delimiterArgument() {
    const tokens = this.rawArgument().filter(token => token.kind !== 'space');
    if (!tokens.length) return '';
    const parser = new MathTexParser(this.source, {tokens, scopes: this.scopes, budget: this.budget});
    const delimiter = parser.readDelimiter();
    if (parser.peek().kind !== 'eof') this.error('invalid-delimiter', 'A delimiter must be one symbol.', tokens[0]);
    return delimiter;
  }
  readDots(name) {
    let next = this.rawPeek();
    if (name === 'dots' && next.kind === 'command' && next.value === 'boldsymbol') {
      const frames = this.frames.map(frame => ({...frame}));
      try { this.rawTake(); next = this.rawArgument()[0] || this.eof; }
      finally { this.frames = frames; }
    }
    let macro = next.kind === 'command' && !next.builtin && this.macro(next.value);
    if (macro?.body?.[0]?.builtin) { next = macro.body[0]; macro = null; }
    const first = macro?.body?.[0], command = next.kind === 'command' ? next.value : '',
      centered = macro ? first?.kind === 'command' && /^(mathbin|mathrel|not|DOTSB)$/.test(first.value) :
        next.kind === 'char' ? ['bin', 'rel'].includes(MATH_TEX_LITERAL_CLASSES[next.value]) :
          command === 'not' || Object.hasOwn(MATH_TEX_LONG_ARROWS, command) ||
          !MATH_TEX_DOTS_LOW.has(command) && ['bin', 'rel'].includes(MATH_SYMBOLS[command]?.class),
      integral = name === 'dotsi' || name === 'dots' && (command === 'idotsint' || first?.value === 'DOTSI'),
      raised = integral || name === 'dotsb' || name === 'dotsm' || name === 'dots' && centered,
      closing = next.kind === 'eof' || next.kind === 'char' && /^(\)|\]|\$)$/.test(next.value) ||
        /^(rbrack|\}|rbrace|rangle|rceil|rfloor|rgroup|rmoustache|right|bigr|biggr|Bigr|Biggr)$/.test(command),
      extra = !integral && (name === 'dots' ? !raised && closing : closing || next.kind === 'char' &&
        (name === 'dotsc' ? /^[.;]$/.test(next.value) : /^[,.;]$/.test(next.value))),
      dots = this.node('glyph', raised ? MATH_SYMBOLS.cdots : MATH_SYMBOLS.ldots);
    return integral || extra ? this.node('style', {class: 'inner', body: this.row([
      ...(integral ? [this.node('space', {width: -1 / 6})] : []), dots, ...(extra ? [this.node('space', {width: 1 / 6})] : [])
    ])}) : dots;
  }
  readLink(token) {
    const href = this.rawArgument().map(item => {
      if (item.kind !== 'command' || /^[#$%&_]$/.test(item.value)) return item.value;
      this.error('unsafe-link', 'A link address cannot contain TeX commands.', item);
    }).join('').trim();
    if (!/^https?:\/\/[^\s<>"'\\]+$/i.test(href) || /[\u0000-\u0020\u007f]/.test(href))
      this.error('unsafe-link', 'A math link must use an HTTP or HTTPS address.', token);
    return href;
  }
  dimension(value, token = this.rawPeek()) {
    const match = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(em|ex|mu|pt|px|pc|in|cm|mm|bp|dd|cc|sp)\s*$/.exec(value);
    if (!match) this.error('invalid-dimension', 'A length needs a number and a TeX unit.', token);
    const factors = {em: 1, ex: .45, mu: 1 / 18, pt: .1, px: .075, pc: 1.2, in: 7.227, cm: 7.227 / 2.54, mm: 7.227 / 25.4, bp: 7.227 / 72, dd: .107, cc: 1.284, sp: .1 / 65536};
    const result = Number(match[1]) * factors[match[2]];
    if (!Number.isFinite(result) || Math.abs(result) > 1000) this.error('resource-limit', 'This length is too large to render safely.', token);
    return result;
  }
  readDimension() {
    if (this.is('{')) return this.dimension(this.plainArgument());
    const start = this.peek(), tokens = [];
    while (this.peek().kind === 'char' && /^[+\-\d.]$/.test(this.peek().value)) tokens.push(this.take());
    while (this.peek().kind === 'char' && /^[A-Za-z]$/.test(this.peek().value) && tokens.filter(item => /[A-Za-z]/.test(item.value)).length < 2) tokens.push(this.take());
    const value = mathTexTokenText(tokens);
    return this.dimension(value, start);
  }
  readColor() {
    const model = this.optionalRaw();
    return this.color(this.plainArgument(), model ? mathTexTokenText(model).trim() : '', this.rawPeek());
  }
  color(value, model, token) {
    // xcolor's mixes: red!30 is 30% red in white; red!30!blue is 30% red in blue, and so on along the expression.
    if (!model && value.includes('!')) {
      const parts = value.split('!'), rgb = name => {
        const hex = Object.hasOwn(MATH_TEX_XCOLOR_BASE, name) ? MATH_TEX_XCOLOR_BASE[name] : Object.hasOwn(this.colors, name) ? this.colors[name] : MATH_TEX_DVIPSNAMES[name] || (/^#[a-fA-F0-9]{6}$/.test(name) ? name : null);
        if (!hex || !/^#[a-fA-F0-9]{6}$/.test(hex)) this.error('invalid-color', 'Unsupported or invalid color value.', token, 'color');
        return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
      };
      // xcolor mixes in the first color's model: a dvipsnames color mixes in CMYK, with RGB as 1 - x less its black.
      const cmyk = !Object.hasOwn(this.colors, parts[0].trim()) && MATH_TEX_DVIPS_CMYK[parts[0].trim()], channels = name => {
        if (!cmyk) return rgb(name);
        if (!Object.hasOwn(this.colors, name) && MATH_TEX_DVIPS_CMYK[name]) return MATH_TEX_DVIPS_CMYK[name];
        const [c, m, y] = rgb(name).map(channel => 1 - channel), k = Math.min(c, m, y);
        return [c - k, m - k, y - k, k];
      };
      let mixed = channels(parts[0].trim());
      for (let i = 1; i < parts.length; i += 2) {
        const percent = Number(parts[i]);
        if (!/^\s*\d+(?:\.\d+)?\s*$/.test(parts[i]) || percent > 100) this.error('invalid-color', 'Unsupported or invalid color value.', token, 'color');
        const other = i + 1 < parts.length ? channels(parts[i + 1].trim()) : cmyk ? [0, 0, 0, 0] : [1, 1, 1];
        mixed = mixed.map((channel, k) => channel * percent / 100 + other[k] * (1 - percent / 100));
      }
      if (cmyk) mixed = mixed.slice(0, 3).map(channel => 1 - Math.min(1, channel + mixed[3]));
      return '#' + mixed.map(channel => Math.round(channel * 255).toString(16).padStart(2, '0')).join('');
    }
    if (!model) {
      if (Object.hasOwn(this.colors, value)) return this.colors[value];
      if (MATH_TEX_DVIPSNAMES[value]) return MATH_TEX_DVIPSNAMES[value];
      if (/^#[a-fA-F0-9]{3,8}$/.test(value) && [4, 5, 7, 9].includes(value.length)) return value;
      if (/^[A-Za-z]{1,32}$/.test(value) && !/^(inherit|unset|initial|revert)$/i.test(value)) return value;
    } else if (model === 'HTML' && /^[a-fA-F0-9]{6}$/.test(value)) return '#' + value;
    else if (['rgb', 'RGB', 'gray', 'cmyk'].includes(model)) {
      const numbers = value.split(',').map(Number), count = model === 'gray' ? 1 : model === 'cmyk' ? 4 : 3, max = model === 'RGB' ? 255 : 1;
      if (numbers.length === count && numbers.every(number => Number.isFinite(number) && number >= 0 && number <= max)) {
        let rgb = model === 'gray' ? Array(3).fill(numbers[0]) : numbers;
        if (model === 'cmyk') rgb = numbers.slice(0, 3).map(number => 1 - Math.min(1, number + numbers[3]));
        return '#' + rgb.map(number => Math.round(number * (model === 'RGB' ? 1 : 255)).toString(16).padStart(2, '0')).join('');
      }
    }
    this.error('invalid-color', 'Unsupported or invalid color value.', token, 'color');
  }

  environment(fullName, token) {
    const env = fullName.replace(/\*$/, '');
    if (!MATH_TEX_ENVIRONMENTS.has(env)) throw Object.assign(new MathTexError('unsupported-environment', 'Unsupported math environment: ' + fullName + '.', token.offset, 'begin'), {environment: env});
    return this.nested(() => {
      let options = {};
      const position = this.optionalRaw();
      if (position) {
        const value = mathTexTokenText(position).trim();
        if (!/^[tbclr]$/.test(value)) this.error('invalid-option', 'Invalid matrix alignment.', token);
        if (['l', 'r', 'c'].includes(value)) options.columnAlign = value;
        else options.position = value;
      }
      if (env === 'CD') return this.commutativeDiagram(fullName, token);
      if (env === 'array' || env === 'subarray' || env === 'darray') options = {...options, ...this.columnSpec(this.rawArgument(), token)};
      if (env === 'alignedat' || env === 'alignat') {
        const value = this.plainArgument();
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 256) this.error('invalid-alignment', 'An alignedat environment needs its number of column pairs.', token);
        options.pairs = Number(value);
      }
      const body = this.readTable(env, options, item => item.kind === 'command' && item.value === 'end', /cases\*$/.test(fullName) ? 1 : -1);
      this.expect('end', 'command');
      const ending = this.plainArgument();
      if (ending !== fullName) this.error('mismatched-environment', 'Expected \\end{' + fullName + '}, received \\end{' + ending + '}.', token);
      return body;
    });
  }
  // amscd: rows of objects joined by @>>>, @<<< and @= arrows, between rows of @VVV, @AAA, @| and @. arrows.
  commutativeDiagram(fullName, token) {
    const rows = [];
    let cells = [], current = [];
    const arrow = (kind, labels) => {
      const label = tokens => tokens.length ? this.subparse(tokens) : null;
      if (kind === '>' || kind === '<' || kind === '=') {
        const body = this.node('overunder', {base: this.literal(kind === '>' ? '→' : kind === '<' ? '←' : '=', {class: 'rel', stretch: true}),
          ...(kind !== '=' ? {over: label(labels[0]) || this.row([])} : {}), ...(labels[1]?.length ? {under: label(labels[1])} : {}), class: 'rel', minWidth: 3, labelPad: 15, diagram: true});
        return this.row([this.node('space', {width: 0.5}), body, this.node('space', {width: 0.5})]);
      }
      if (kind === '.') return this.row([]);
      const side = (tokens, align) => tokens?.length ? [this.node('style', {width: 0, align, body: this.node('raise', {center: true, body: this.node('style', {mathStyle: 'script', body: label(tokens)})})})] : [];
      return this.row([...side(labels[0], 'right'), this.literal(kind === 'V' ? '↓' : kind === 'A' ? '↑' : '‖', {delimiterSize: 1.8, class: 'ord'}), ...side(labels[1], 'left')]);
    };
    for (;;) {
      const item = this.rawTake(false);
      if (item.kind === 'eof') this.error('unclosed-environment', 'A closing \\end command is missing.', token);
      const end = item.kind === 'command' && item.value === 'end';
      if (end || item.kind === 'command' && item.value === '\\') {
        if (current.some(part => part.kind !== 'space')) cells.push(this.subparse(current));
        if (cells.length) rows.push(cells);
        if (end) break;
        cells = []; current = []; continue;
      }
      if (!(item.kind === 'char' && item.value === '@')) { current.push(item); continue; }
      const kind = this.rawTake(false), name = kind.kind === 'command' && kind.value === '|' ? '|' : kind.value;
      if (!'><=VA|.'.includes(name) || kind.kind === 'eof') this.error('invalid-diagram', 'Expected an amscd arrow after @.', kind);
      const labels = [];
      if ('><VA'.includes(name)) for (let part = 0; part < 2; part++) {
        const tokens = [];
        for (let depth = 0, next = this.rawTake(false); depth || !(next.kind === 'char' && next.value === name); next = this.rawTake(false)) {
          if (next.kind === 'eof') this.error('invalid-diagram', 'An amscd arrow is missing its closing ' + name + '.', kind);
          if (next.kind === 'char') depth += next.value === '{' ? 1 : next.value === '}' ? -1 : 0;
          tokens.push(next);
        }
        labels.push(tokens);
      }
      if ('VA|'.includes(name) || name === '.' && rows.length % 2) { cells.push(arrow(name, labels), this.row([])); current = []; continue; }
      cells.push(current.some(part => part.kind !== 'space') ? this.subparse(current) : this.row([]), arrow(name, labels)); current = [];
    }
    const ending = this.plainArgument();
    if (ending !== fullName) this.error('mismatched-environment', 'Expected \\end{' + fullName + '}, received \\end{' + ending + '}.', token);
    for (const row of rows) if (row.length % 2 === 0 && row.at(-1).type === 'row' && !row.at(-1).children.length) row.pop();
    const columns = Math.max(...rows.map(row => row.length));
    return this.node('table', {env: 'CD', rows, align: Array(columns).fill('c'), rowGaps: [], rowRules: []});
  }
  tableFromTokens(tokens, env) {
    return this.nested(() => {
      const parser = new MathTexParser(this.source, {tokens, scopes: this.scopes, budget: this.budget, colors: this.colors});
      const result = parser.readTable(env, {}, item => item.kind === 'eof');
      if (parser.peek().kind !== 'eof') parser.error('unexpected-token', 'Unexpected content after the matrix.');
      return result;
    });
  }
  columnSpec(tokens, token) {
    const parser = new MathTexParser(this.source, {tokens, scopes: this.scopes, budget: this.budget, colors: this.colors});
    // arydshln's : is a dashed rule; columnDashes marks which rules are dashed.
    const align = [], columnRules = [], columnInsertions = [], columnDashes = [];
    while (parser.peek().kind !== 'eof') {
      const item = parser.take();
      if (item.kind === 'char' && /^[lcr]$/.test(item.value)) { this.reserveParts(1, item); align.push(item.value); }
      else if (item.kind === 'char' && (item.value === '|' || item.value === ':')) { this.reserveParts(1, item); columnRules.push(align.length); columnDashes.push(item.value === ':'); }
      else if (item.kind === 'char' && (item.value === '@' || item.value === '!')) {
        this.reserveParts(1, item);
        columnInsertions.push({before: align.length, body: this.subparse(parser.rawArgument()), replaceGap: item.value === '@'});
      }
      else if (item.kind === 'char' && item.value === '*') {
        const count = parser.plainArgument();
        if (!/^\d+$/.test(count) || Number(count) > 256) this.error('invalid-alignment', 'Invalid array column repetition.', item);
        const repeated = this.nested(() => this.columnSpec(parser.rawArgument(), item));
        if (align.length + Number(count) * repeated.align.length > 256)
          this.error('resource-limit', 'This array has too many columns to render safely.', item);
        // Reserve the complete expansion before allocating any repeated metadata.
        this.reserveParts(Number(count) * (repeated.align.length + repeated.columnRules.length + repeated.columnInsertions.length), item);
        for (let i = 0; i < Number(count); i++) {
          const at = align.length;
          columnRules.push(...repeated.columnRules.map(index => at + index)); columnDashes.push(...(repeated.columnDashes || repeated.columnRules.map(() => false)));
          columnInsertions.push(...repeated.columnInsertions.map(insertion => ({...insertion, before: at + insertion.before})));
          align.push(...repeated.align);
        }
      } else this.error('unsupported-alignment', 'Unsupported array column specification: ' + item.value + '.', item);
      if (align.length > 256) this.error('resource-limit', 'This array has too many columns to render safely.', token);
    }
    if (!align.length) this.error('invalid-alignment', 'An array needs a column specification.', token);
    return {align, columnRules, columnInsertions, ...(columnDashes.some(Boolean) ? {columnDashes} : {})};
  }
  // mathtools' starred cases set their condition column as text, with $...$ for maths.
  textCell(separator) {
    const tokens = [];
    for (let depth = 0, token = this.rawPeek(false); token.kind !== 'eof' && (depth > 0 || !separator(token)); token = this.rawPeek(false)) {
      if (token.kind === 'char') depth += token.value === '{' ? 1 : token.value === '}' ? -1 : 0;
      tokens.push(this.rawTake(false));
    }
    while (tokens[0]?.kind === 'space') tokens.shift();
    while (tokens.at(-1)?.kind === 'space') tokens.pop();
    return this.subparse(tokens, true);
  }
  readTable(env, options, end, textColumn = -1) {
    const rows = [], rowGaps = [], rowRules = [];
    let cells = [], endedAfterBreak = false;
    const separator = item => (item.kind === 'char' && item.value === '&') || (item.kind === 'command' && ['\\', 'cr', 'crcr'].includes(item.value)) || end(item);
    for (;;) {
      if (this.peek().kind === 'eof' && !end(this.peek())) this.error('unclosed-environment', 'A closing \\end command is missing.');
      while (this.commandIs('hline') || this.commandIs('hdashline') || this.commandIs('cline')) {
        const line = this.take();
        if (line.value === 'cline') {
          const range = this.plainArgument(), match = /^(\d+)-(\d+)$/.exec(range);
          if (!match || Number(match[1]) < 1 || Number(match[2]) < Number(match[1])) this.error('invalid-rule', 'A partial rule needs a column range.', line);
          rowRules.push({before: rows.length, from: Number(match[1]) - 1, to: Number(match[2])});
        } else rowRules.push({before: rows.length, dashed: line.value === 'hdashline'});
      }
      if (end(this.peek())) {
        if (cells.length || (!rows.length && !endedAfterBreak)) { cells.push(this.row([])); rows.push(cells); }
        break;
      }
      // amsmath's \intertext is a line of text between the rows of an alignment, set at its left.
      if (this.commandIs('intertext')) {
        const at = this.take();
        if (!/^(align|alignat|flalign|gather)$/.test(env) || cells.length) this.error('unexpected-intertext', '\\intertext goes at the start of a row of align, alignat, flalign or gather.', at);
        rows.push([this.node('row', {children: [this.subparse(this.rawArgument(), true)], intertext: true})]);
        // It sits a display skip (10 pt, 1 em with the row's \jot) from the rows around it.
        if (rows.length > 1) rowGaps[rows.length - 2] = (rowGaps[rows.length - 2] || 0) + 0.7;
        rowGaps[rows.length - 1] = 0.7;
        continue;
      }
      // \multicolumn{n}{spec}{body} and amsmath's \hdotsfor[spacing]{n} fill n columns of one row.
      if (this.commandIs('multicolumn') || this.commandIs('hdotsfor')) {
        const at = this.take(), dots = at.value === 'hdotsfor', spacing = dots ? this.optionalRaw() : null, count = this.plainArgument();
        if (!/^\d+$/.test(count) || +count < 1 || cells.length + +count > 256) this.error('invalid-alignment', '\\' + at.value + ' needs a column count.', at);
        let cell;
        if (dots) {
          const factor = spacing ? Number(mathTexTokenText(spacing).trim()) : 1;
          if (!(factor > 0 && factor <= 16)) this.error('invalid-option', '\\hdotsfor spacing must be a positive number.', at);
          cell = this.node('row', {children: [], span: +count, dots: factor});
        } else {
          const spec = this.columnSpec(this.rawArgument(), at);
          if (spec.align.length !== 1) this.error('invalid-alignment', '\\multicolumn takes one column.', at);
          cell = this.node('row', {children: [this.argument()], span: +count, spanAlign: spec.align[0], ...(spec.columnRules.length ? {spanRules: spec.columnRules} : {})});
        }
        if (!separator(this.peek())) this.error('unexpected-token', 'A \\' + at.value + ' fills its whole cell.', this.peek());
        cells.push(cell);
        for (let i = 1; i < +count; i++) cells.push(this.node('row', {children: [], covered: true}));
      } else cells.push(cells.length === textColumn ? this.textCell(separator) : this.nested(() => this.parseRow(separator)));
      endedAfterBreak = false;
      const next = this.peek();
      if (next.kind === 'char' && next.value === '&') { this.take(); continue; }
      rows.push(cells); cells = [];
      if (end(next)) break;
      if (next.kind === 'command' && ['\\', 'cr', 'crcr'].includes(next.value)) {
        this.take();
        if (this.is('*')) this.take();
        const gap = this.optionalRaw();
        rowGaps[rows.length - 1] = gap ? this.dimension(mathTexTokenText(gap), next) : 0;
        endedAfterBreak = true;
      } else this.error('unexpected-alignment', 'Expected a row separator or the end of the environment.', next);
      if (rows.length > 2048 || cells.length > 256) this.error('resource-limit', 'This matrix is too large to render safely.', next);
    }
    const columns = rows.reduce((max, row) => Math.max(max, row.length), 0);
    if (columns > 256) this.error('resource-limit', 'This matrix has too many columns to render safely.');
    if (options.align && rows.some(row => row.length > options.align.length)) this.error('invalid-alignment', 'This row has more cells than the array declares.');
    if (options.pairs && rows.some(row => row.length > options.pairs * 2)) this.error('invalid-alignment', 'This row has more cells than alignedat declares.');
    let align = options.align;
    if (!align) align = Array.from({length: columns}, (_, index) => /^(align|aligned|alignat|alignedat|flalign|split)$/.test(env) ? (index % 2 ? 'l' : 'r') : /cases$/.test(env) || env === 'lgathered' ? 'l' : env === 'rgathered' ? 'r' : options.columnAlign || 'c');
    return this.node('table', {env, rows, ...options, align, rowGaps, rowRules});
  }

  define(name, token) {
    let starred = false;
    if (this.rawPeek().kind === 'char' && this.rawPeek().value === '*') { this.rawTake(); starred = true; }
    const nameTokens = this.rawArgument().filter(item => item.kind !== 'space');
    if (nameTokens.length !== 1 || nameTokens[0].kind !== 'command') this.error('invalid-macro', 'A macro name must be one command.', token);
    const macroName = nameTokens[0].value;
    const make = value => ({kind: 'command', value, offset: token.offset});
    const literal = value => ({kind: 'char', value, offset: token.offset});
    if (name === 'DeclareMathOperator') {
      const body = this.rawArgument();
      this.scopes[this.scopes.length - 1][macroName] = {params: [], prefix: [], body: [make('operatorname'), ...(starred ? [literal('*')] : []), literal('{'), ...body, literal('}')], optional: null};
      return;
    }
    if (name === 'DeclarePairedDelimiter') {
      const left = this.rawArgument(), right = this.rawArgument();
      this.scopes[this.scopes.length - 1][macroName] = {params: [], prefix: [], body: [make('@paired'), literal('{'), ...left, literal('}'), literal('{'), ...right, literal('}')], optional: null};
      return;
    }
    if (name === 'let') {
      if (this.rawPeek().kind === 'char' && this.rawPeek().value === '=') this.rawTake();
      const target = this.rawTake();
      if (target.kind === 'eof') this.error('invalid-macro', '\\let needs a replacement token.', token);
      const existing = target.kind === 'command' && this.macro(target.value);
      this.scopes[this.scopes.length - 1][macroName] = existing || {params: [], prefix: [], body: [{...target, builtin: true}], optional: null};
      return;
    }
    let params = [], prefix = [], optional = null, body;
    if (/^[egx]?def$/.test(name)) {
      const specification = [];
      while (!(this.rawPeek().kind === 'char' && this.rawPeek().value === '{')) {
        const item = this.rawTake(false);
        if (item.kind === 'eof') this.error('invalid-macro', 'A macro definition needs a replacement group.', token);
        specification.push(item);
      }
      let current = prefix;
      for (let i = 0; i < specification.length; i++) {
        const item = specification[i];
        if (item.kind === 'char' && item.value === '#') {
          const number = specification[++i];
          if (!number || number.kind !== 'char' || Number(number.value) !== params.length + 1 || !/^[1-9]$/.test(number.value)) this.error('invalid-macro', 'Macro parameters must be numbered consecutively from 1.', item);
          const parameter = {index: Number(number.value), delimiter: []};
          params.push(parameter); current = parameter.delimiter;
        } else current.push(item);
      }
      body = this.rawArgument();
      if (name === 'edef' || name === 'xdef') {
        // \edef expands the macros in its replacement when it is defined.
        const parser = new MathTexParser(this.source, {tokens: body, scopes: this.scopes, budget: this.budget});
        body = [];
        for (let item = parser.take(false); item.kind !== 'eof'; item = parser.take(false)) body.push(item);
      }
    } else {
      const countTokens = this.optionalRaw();
      const count = countTokens ? mathTexTokenText(countTokens).trim() : '0';
      if (!/^[0-9]$/.test(count)) this.error('invalid-macro', 'A macro accepts zero to nine arguments.', token);
      params = Array.from({length: Number(count)}, (_, index) => ({index: index + 1, delimiter: []}));
      optional = this.optionalRaw();
      if (optional && !params.length) this.error('invalid-macro', 'An optional argument needs a parameter.', token);
      body = this.rawArgument();
    }
    for (let i = 0; i < body.length; i++) if (body[i].kind === 'char' && body[i].value === '#') {
      const next = body[++i];
      if (!next || next.kind !== 'char' || !(next.value === '#' || (/^[1-9]$/.test(next.value) && Number(next.value) <= params.length)))
        this.error('invalid-macro', 'A replacement refers to a missing macro parameter.', body[i - 1]);
    }
    const existing = this.macro(macroName) || Object.hasOwn(MATH_SYMBOLS, macroName) || Object.hasOwn(MATH_TEX_VARIANTS, macroName) || MATH_NAMED_OPERATORS.has(macroName) || MATH_LIMIT_OPERATORS.has(macroName);
    if (name === 'providecommand' && existing) return;
    if (name === 'newcommand' && existing) this.error('duplicate-macro', '\\' + macroName + ' is already defined.', token);
    this.scopes[name === 'gdef' || name === 'xdef' ? 0 : this.scopes.length - 1][macroName] = {params, prefix, body, optional};
  }
  expand(macro, token) {
    if (++this.budget.expansions > 4096) this.error('resource-limit', 'Macro expansion did not finish within the rendering limit.', token);
    for (const prefix of macro.prefix) {
      const actual = this.rawTake(prefix.kind !== 'space');
      if (!mathTexTokenEqual(actual, prefix)) this.error('invalid-macro-argument', 'A macro argument does not match its definition.', actual, token.value);
    }
    const args = [];
    for (const param of macro.params) {
      if (param.index === 1 && macro.optional) args[param.index] = this.optionalRaw() || macro.optional;
      else if (!param.delimiter.length) args[param.index] = this.rawArgument();
      else {
        const value = [];
        let depth = 0;
        for (;;) {
          const item = this.rawTake(false);
          if (item.kind === 'eof') this.error('invalid-macro-argument', 'A delimited macro argument is incomplete.', token);
          value.push(item);
          if (item.kind === 'char' && item.value === '{') depth++;
          if (item.kind === 'char' && item.value === '}') depth--;
          if (depth < 0) this.error('invalid-macro-argument', 'A macro argument escaped its group.', item);
          if (depth === 0 && value.length >= param.delimiter.length && param.delimiter.every((expected, index) => mathTexTokenEqual(value[value.length - param.delimiter.length + index], expected))) {
            value.length -= param.delimiter.length;
            break;
          }
        }
        if (value[0]?.value === '{' && value[value.length - 1]?.value === '}') {
          let depth = 0, whole = true;
          for (let i = 0; i < value.length - 1; i++) {
            if (value[i].kind === 'char' && value[i].value === '{') depth++;
            if (value[i].kind === 'char' && value[i].value === '}') depth--;
            if (!depth) whole = false;
          }
          args[param.index] = whole ? value.slice(1, -1) : value;
        } else args[param.index] = value;
      }
    }
    const replacement = [];
    for (let i = 0; i < macro.body.length; i++) {
      const item = macro.body[i];
      if (item.kind === 'char' && item.value === '#') {
        const next = macro.body[++i];
        if (next.value === '#') replacement.push(next);
        else for (const replacementToken of args[Number(next.value)]) {
          replacement.push(replacementToken);
          if (replacement.length > 100000) this.error('resource-limit', 'A macro expands to too much content.', token);
        }
      } else replacement.push(item);
      if (replacement.length > 100000) this.error('resource-limit', 'A macro expands to too much content.', token);
    }
    this.budget.expandedTokens += replacement.length;
    if (this.budget.expandedTokens > 100000) this.error('resource-limit', 'Macro expansion produced too much content to render safely.', token);
    this.frames.push({tokens: replacement, at: 0});
  }

  readVerb(token) {
    // Raw spans are single tokens, but each copied character consumes the same admission budget as a glyph.
    this.reserveParts(token.value.length, token);
    // LaTeX places \verb in a text-size hbox, including when it occurs in a script.
    return this.node('style', {mathStyle: 'text', body: this.node('text', {
      value: token.value.replace(/[ \t]/g, token.starred ? '\u2423' : '\u00a0'), variant: 'monospace', verbatim: true, at: token.offset
    })});
  }
  parseText(variant = 'roman') {
    const children = [];
    let value = '';
    // TeX's text fonts join --- and -- into dashes and turn `` '' ` ' into curly quotes; typewriter text keeps them.
    const flush = () => { if (value) children.push(this.node('text', {value: variant === 'monospace' ? value : value.replace(/---|--|``|''|`|'/g, run => ({'---': '—', '--': '–', '``': '“', "''": '”', '`': '‘', "'": '’'})[run]), variant})); value = ''; };
    for (;;) {
      const token = this.take(false);
      if (token.kind === 'eof') break;
      if (token.kind === 'verbatim') { flush(); children.push(this.readVerb(token)); continue; }
      if (token.kind === 'space') { value += ' '; continue; }
      if (token.kind === 'char') {
        if (token.value === '{') {
          flush();
          this.frames.push({tokens: [token], at: 0});
          children.push(this.subparse(this.rawArgument(), true, variant));
        } else if (token.value === '$') {
          flush();
          children.push(this.nested(() => this.parseRow(item => item.kind === 'char' && item.value === '$')));
          this.expect('$');
        } else if (token.value === '}') this.error('unexpected-brace', 'A closing brace has no opening brace.', token);
        else if (token.value === '#' || token.value === '&' || token.value === '_') this.error('invalid-text', 'Escape ' + token.value + ' inside text.', token);
        else value += token.value === '~' ? '\u00a0' : token.value;
        continue;
      }
      const name = token.value;
      if (/^[{}%$&#_ ]$/.test(name)) { value += name; continue; }
      if (name === '-') continue;
      if (name === 'TeX' || name === 'LaTeX') { value += name; continue; }
      if (name === 'textbackslash') { value += '\\'; continue; }
      if (name === 'textasciitilde') { value += '~'; continue; }
      if (name === 'textasciicircum') { value += '^'; continue; }
      if (name === '(' || name === '[') {
        flush();
        const end = name === '(' ? ')' : ']';
        children.push(this.nested(() => this.parseRow(item => item.kind === 'command' && item.value === end)));
        this.expect(end, 'command');
        continue;
      }
      if (Object.hasOwn(MATH_TEX_TEXT_VARIANTS, name)) {
        flush(); children.push(this.subparse(this.rawArgument(), true, mathTextVariant(variant, name))); continue;
      }
      if (name === 'color' || name === 'textcolor') {
        flush();
        const color = this.readColor();
        children.push(this.node('style', {color, body: name === 'color' ? this.nested(() => this.parseText(variant)) : this.subparse(this.rawArgument(), true, variant)}));
        if (name === 'color') break;
        continue;
      }
      if (name === 'href') {
        flush();
        const href = this.readLink(token);
        children.push(this.node('link', {href, body: this.subparse(this.rawArgument(), true, variant)}));
        continue;
      }
      if (name === 'fbox' || name === 'colorbox' || name === 'fcolorbox') {
        flush();
        const border = name === 'fbox' ? 'currentColor' : name === 'fcolorbox' ? this.readColor() : undefined;
        const background = name === 'fbox' ? undefined : this.readColor();
        children.push(this.node('style', {body: this.subparse(this.rawArgument(), true, variant), ...(border ? {border} : {}), ...(background ? {background} : {}), padding: .25}));
        continue;
      }
      if (name === 'underline') {
        flush();
        children.push(this.node('accent', {base: this.subparse(this.rawArgument(), true, variant), value: '_', position: 'under', stretch: true}));
        continue;
      }
      if (Object.hasOwn(MATH_TEX_DECLARATIONS, name)) {
        flush(); children.push(this.node('style', {...MATH_TEX_DECLARATIONS[name], body: this.nested(() => this.parseText(MATH_TEX_DECLARATIONS[name].variant || variant))})); break;
      }
      if (/^['`"^~=.]$/.test(name) || ['c', 'v', 'u', 'H', 'r', 'k', 'b', 'd'].includes(name)) {
        const marks = {"'": '\u0301', '`': '\u0300', '"': '\u0308', '^': '\u0302', '~': '\u0303', '=': '\u0304', '.': '\u0307', c: '\u0327', v: '\u030c', u: '\u0306', H: '\u030b', r: '\u030a', k: '\u0328', b: '\u0331', d: '\u0323'};
        const raw = this.rawArgument();
        const letters = mathTexTokenText(raw).trim();
        if ([...letters].length !== 1) this.error('invalid-accent', 'A text accent needs one character.', token);
        value += (letters + marks[name]).normalize('NFC'); continue;
      }
      if (Object.hasOwn(MATH_TEX_TEXT_LETTERS, name)) { value += MATH_TEX_TEXT_LETTERS[name]; continue; }
      if (Object.hasOwn(MATH_SYMBOLS, name) && !MATH_SYMBOLS[name].large) { value += MATH_SYMBOLS[name].value; continue; }
      flush();
      const body = this.command(token);
      if (body) children.push(body);
    }
    flush();
    return this.row(children);
  }

  physics(name, token) {
    const starred = this.is('*'); if (starred) this.take();
    if (/^(dv|derivative|pdv|pderivative|fdv|functionalderivative)$/.test(name)) {
      const orderTokens = this.optionalRaw(), first = this.argument(), second = this.is('{') ? this.argument() : null;
      const variables = [second || first];
      if (/^(pdv|pderivative)$/.test(name)) while (this.is('{') && variables.length < 9) variables.push(this.argument());
      const d = () => this.literal(/^(pdv|pderivative)$/.test(name) ? '∂' : /^(fdv|functionalderivative)$/.test(name) ? 'δ' : 'd', {variant: 'roman'});
      const order = orderTokens ? this.subparse(orderTokens) : variables.length > 1 ? this.literal(String(variables.length), {variant: 'roman'}) : null;
      const numerator = this.row([order ? this.node('scripts', {base: d(), sup: order}) : d(), ...(second ? [first] : [])]);
      const denominator = this.row(variables.flatMap((variable, index) => [d(), order && variables.length === 1 ? this.node('scripts', {base: variable, sup: order}) : variable, ...(index < variables.length - 1 ? [this.node('space', {width: .1})] : [])]));
      return this.node('frac', {num: numerator, den: denominator, bar: true, ...(starred ? {style: 'text'} : {})});
    }
    if (name === 'dd' || name === 'differential') {
      const order = this.optionalRaw(), base = this.literal('d', {variant: 'roman'});
      return this.row([this.node('space', {width: 3 / 18}), order ? this.node('scripts', {base, sup: this.subparse(order)}) : base, ...(this.is('{') ? [this.argument()] : [])]);
    }
    if (/^(vb|va|vu|vectorbold|vectorarrow|vectorunit)$/.test(name)) {
      const body = this.node('style', {body: this.argument(), variant: starred ? 'bold-italic' : 'bold'});
      return /^(va|vu|vectorarrow|vectorunit)$/.test(name) ? this.node('accent', {base: body, value: /^(vu|vectorunit)$/.test(name) ? '̂' : '⃗', position: 'over'}) : body;
    }
    if (/^(grad|gradient|divergence|curl|laplacian)$/.test(name)) {
      let base = this.literal('∇', {variant: 'roman'});
      if (name === 'laplacian') base = this.node('scripts', {base, sup: this.literal('2', {variant: 'roman'})});
      return this.row([base, ...(/^(divergence|curl)$/.test(name) ? [this.literal(name === 'curl' ? '×' : '⋅', {class: 'bin', variant: 'roman'})] : []), ...(this.is('{') ? [this.argument()] : [])]);
    }
    if (['Tr', 'tr', 'trace', 'rank', 'diag', 'Res'].includes(name)) return this.node('text', {value: name === 'trace' ? 'tr' : name, variant: 'roman', class: 'op', limits: 'never'});
    if (name === 'qty' || name === 'quantity') {
      if (this.is('{')) return this.node('fence', {left: '{', right: '}', body: this.argument()});
      const left = this.readDelimiter(), right = {'(': ')', '[': ']', '{': '}', '|': '|', '‖': '‖', '⟨': '⟩'}[left];
      if (!right) this.error('invalid-delimiter', 'A quantity needs paired delimiters.', token);
      const body = this.nested(() => this.parseRow(item => item.kind === 'char' && item.value === right));
      this.expect(right);
      return this.node('fence', {left, right, body});
    }
    // \qq{text} and the \qif family: text between quads; \qc is a comma and a quad.
    if (/^q/.test(name)) {
      const quad = () => this.node('space', {width: 1}), words = {qcc: 'c.c.'};
      if (name === 'qc') return this.node('style', {class: 'punct', body: this.row([this.literal(',', {class: 'punct'}), quad()])});
      return this.row([quad(), name === 'qq' ? this.subparse(this.rawArgument(), true) : this.node('text', {value: words[name] || name.slice(1), variant: 'roman'}), quad()]);
    }
    if (name === 'eval' || name === 'evaluated') return this.node('fence', {left: '', right: '|', body: this.argument()});
    if (name === 'order') return this.row([this.literal('O'), this.node('fence', {left: '(', right: ')', body: this.argument()})]);
    // \mqty(…), \mqty[…] and \mqty|…| choose their brackets as physics.sty does.
    if (name === 'mqty' && ['(', '[', '|'].includes(this.rawPeek().value) && this.rawPeek().kind === 'char') {
      const open = this.rawTake().value, close = {'(': ')', '[': ']', '|': '|'}[open], tokens = [];
      for (let depth = 0, token = this.rawTake(false); ; token = this.rawTake(false)) {
        if (token.kind === 'eof') this.error('unclosed-group', 'Expected ' + close + '.', token);
        if (token.kind === 'char' && token.value === '{') depth++;
        if (token.kind === 'char' && token.value === '}') depth--;
        if (!depth && token.kind === 'char' && token.value === close) break;
        tokens.push(token);
      }
      return this.tableFromTokens(tokens, {'(': 'pmatrix', '[': 'bmatrix', '|': 'vmatrix'}[open]);
    }
    if (/^(mqty|pmqty|bmqty|Bmqty|vmqty|smqty)$/.test(name)) {
      const env = name === 'bmqty' ? 'bmatrix' : name === 'Bmqty' ? 'Bmatrix' : name === 'vmqty' ? 'vmatrix' : name === 'smqty' ? 'smallmatrix' : name === 'pmqty' ? 'pmatrix' : 'matrix';
      return this.tableFromTokens(this.rawArgument(), env);
    }
    if (name === 'Pmqty') return this.node('fence', {left: '⟮', right: '⟯', body: this.tableFromTokens(this.rawArgument(), 'matrix')});
    // physics.sty's matrix contents: diagonal and antidiagonal (a filler fills the rest), identity, zero, a matrix of x_{ij}, Pauli.
    if (/^(dmat|diagonalmatrix|admat|antidiagonalmatrix|imat|identitymatrix|zmat|zeromatrix|xmat|xmatrix|pmat|paulimatrix)$/.test(name)) {
      const text = tokens => mathTexTokenText(tokens).trim(), cells = [];
      const count = tokens => { const n = Number(text(tokens)); if (!Number.isInteger(n) || n < 1 || n > 32) this.error('invalid-argument', 'A matrix size is a whole number from 1 to 32.', token); return n; };
      if (/^(dmat|diagonalmatrix|admat|antidiagonalmatrix)$/.test(name)) {
        const filler = this.optionalRaw() || [], entries = [], raw = this.rawArgument();
        let depth = 0, entry = [];
        for (const item of raw) {
          if (item.kind === 'char' && item.value === '{') depth++;
          if (item.kind === 'char' && item.value === '}') depth--;
          if (!depth && item.kind === 'char' && item.value === ',') { entries.push(entry); entry = []; } else entry.push(item);
        }
        entries.push(entry);
        if (entries.length > 32) this.error('resource-limit', 'This matrix is too large to render safely.', token);
        const anti = /^a/.test(name);
        // Each diagonal entry is its own \mqty, as in physics.sty.
        const own = entry => [{kind: 'command', value: 'mqty', offset: token.offset}, {kind: 'char', value: '{', offset: token.offset}, ...entry, {kind: 'char', value: '}', offset: token.offset}];
        for (let r = 0; r < entries.length; r++) cells.push(entries.map((_, c) => (anti ? c === entries.length - 1 - r : c === r) ? own(entries[r]) : filler));
      } else if (/^(imat|identitymatrix)$/.test(name)) {
        const n = count(this.rawArgument()), one = mathTexTokens('1', token.offset), zero = mathTexTokens('0', token.offset);
        for (let r = 0; r < n; r++) cells.push(Array.from({length: n}, (_, c) => c === r ? one : zero));
      } else if (/^(zmat|zeromatrix)$/.test(name)) {
        const rows = count(this.rawArgument()), columns = this.is('{') ? count(this.rawArgument()) : rows, zero = mathTexTokens('0', token.offset);
        for (let r = 0; r < rows; r++) cells.push(Array(columns).fill(zero));
      } else if (/^(xmat|xmatrix)$/.test(name)) {
        const symbol = this.rawArgument(), rows = count(this.rawArgument()), columns = count(this.rawArgument());
        for (let r = 1; r <= rows; r++) cells.push(Array.from({length: columns}, (_, c) => [...symbol, ...(starred ? mathTexTokens('_{' + (rows > 1 ? r : '') + (columns > 1 ? c + 1 : '') + '}', token.offset) : [])]));
      } else {
        const which = text(this.rawArgument()), rows = {'0': '1&0\\\\0&1', '1': '0&1\\\\1&0', x: '0&1\\\\1&0', '2': '0&-i\\\\i&0', y: '0&-i\\\\i&0', '3': '1&0\\\\0&-1', z: '1&0\\\\0&-1'}[which];
        if (!rows) this.error('invalid-argument', 'A Pauli matrix is 0, 1, 2, 3, x, y or z.', token);
        return this.tableFromTokens(mathTexTokens(rows, token.offset), 'matrix');
      }
      const amp = {kind: 'char', value: '&', offset: token.offset}, newline = {kind: 'command', value: '\\', offset: token.offset};
      return this.tableFromTokens(cells.flatMap((row, r) => [...(r ? [newline] : []), ...row.flatMap((cell, c) => [...(c ? [amp] : []), ...cell])]), 'matrix');
    }
    const first = this.argument();
    if (/^(bra|ket|pqty|bqty|Bqty|vqty|abs|absolutevalue|norm)$/.test(name)) {
      const ends = {bra: ['⟨', '|'], ket: ['|', '⟩'], pqty: ['(', ')'], bqty: ['[', ']'], Bqty: ['{', '}'], vqty: ['|', '|'], abs: ['|', '|'], absolutevalue: ['|', '|'], norm: ['‖', '‖']}[name];
      return this.node('fence', {left: ends[0], right: ends[1], body: first});
    }
    if (/^(comm|commutator|acomm|anticommutator|pb|poissonbracket)$/.test(name)) return this.node('fence', {left: /^(comm|commutator)$/.test(name) ? '[' : '{', right: /^(comm|commutator)$/.test(name) ? ']' : '}', body: this.row([first, this.literal(',', {class: 'punct'}), this.argument()])});
    if (/^(mel|matrixel|matrixelement)$/.test(name)) {
      const operator = this.argument(), right = this.argument();
      return this.node('fence', {left: '⟨', right: '⟩', body: this.row([first, this.literal('|', {delimiter: true}), operator, this.literal('|', {delimiter: true}), right])});
    }
    const second = this.is('{') ? this.argument() : null;
    if (/^(ketbra|dyad|outerproduct|op)$/.test(name)) return this.row([this.node('fence', {left: '|', right: '⟩', body: first}), this.node('fence', {left: '⟨', right: '|', body: second || first})]);
    if (/^(expval|expectationvalue|ev)$/.test(name)) return this.node('fence', {left: '⟨', right: '⟩', body: second ? this.row([second, this.literal('|', {delimiter: true}), first, this.literal('|', {delimiter: true}), second]) : first});
    return this.node('fence', {left: '⟨', right: '⟩', body: second ? this.row([first, this.literal('|', {delimiter: true}), second]) : first});
  }

  chemistry(tokens) {
    return this.nested(() => {
      const parser = new MathTexParser(this.source, {tokens, scopes: this.scopes, budget: this.budget, colors: this.colors});
      return this.node('style', {variant: 'roman', body: parser.chemicalRow(() => false)});
    });
  }
  chemicalRow(stop) {
    const children = [];
    let spaced = true, subAllowed = false, moleculeParts = 0, isotope = null;
    // mhchem hangs a count, then a charge, each on its own X-high phantom after the formula, side by side.
    const script = (key, body) => {
      const last = children.at(-1);
      if (last?.chemical && !(key === 'sup' && last.sub && !last.sup)) {
        if (last[key]) last[key] = this.row([last[key], body]); else last[key] = body;
        return;
      }
      children.push(this.node('scripts', {base: this.node('phantom', {body: this.node('text', {value: 'X', variant: 'roman'}), mode: 'v'}), [key]: body, chemical: true}));
    };
    const consumeRun = predicate => {
      let value = '';
      while (this.rawPeek(false).kind === 'char' && predicate(this.rawPeek(false).value)) value += this.rawTake(false).value;
      return value;
    };
    for (;;) {
      const next = this.peek(false);
      if (next.kind === 'eof' || stop(next)) break;
      const token = this.take(false);
      if (isotope && !(token.kind === 'char' && /^[\^_A-Za-z]$/.test(token.value))) isotope = null;
      if (token.kind === 'space') {
        spaced = true; subAllowed = false; moleculeParts = 0;
        // An operator or arrow already carries its own spacing; a separating space adds none beside it.
        const after = this.rawPeek(false), before = children.at(-1)?.class;
        if (before !== 'bin' && before !== 'rel' && !children.at(-2)?.unspaced && !(after.kind === 'char' && /^[+<=-]$/.test(after.value))) children.push(this.node('space', {width: 3 / 18}));
        continue;
      }
      if (token.kind === 'command') {
        if (token.value === 'bond') {
          const value = this.plainArgument(), bonds = {'-': '−', '=': '=', '#': '≡', '~': '∼', '->': '→', '<-': '←', '...': '⋯'};
          if (!bonds[value]) this.error('unsupported-bond', 'Unsupported chemical bond: ' + value + '.', token);
          children.push(this.literal(bonds[value], {class: 'ord', variant: 'roman'}));
        } else {
          const body = this.command(token);
          if (body) children.push(this.readScripts(body));
        }
        spaced = false; subAllowed = true; continue;
      }
      if (token.value === '$') {
        children.push(this.node('style', {variant: 'normal', body: this.nested(() => this.parseRow(item => item.kind === 'char' && item.value === '$'))}));
        this.expect('$'); spaced = false; subAllowed = false; continue;
      }
      // mhchem's (^) and (v): a gas given off and a precipitate, with a thin space after.
      if (token.value === '(' && this.rawPeek(false).kind === 'char' && /^[\^v]$/.test(this.rawPeek(false).value)) {
        const mark = this.rawTake(false).value;
        if (this.rawPeek(false).value !== ')') this.error('unexpected-token', 'Expected ).', this.rawPeek(false));
        this.rawTake(false);
        children.push(this.literal(mark === '^' ? '↑' : '↓', {class: 'ord', variant: 'roman'}), this.node('space', {width: 3 / 18})); spaced = false; subAllowed = false; continue;
      }
      if (token.value === '(' || token.value === '[') {
        // mhchem separates a lowercase state from its formula by 0.2 ex (Latin Modern's x height is 0.431 em).
        const before = children.at(-1)?.type === 'space' ? children.at(-2) : children.at(-1), first = this.rawPeek(false);
        if (token.value === '(' && before && !['bin', 'rel'].includes(before.class) && first.kind === 'char' && /^[a-z]$/.test(first.value))
          children.push(this.node('space', {width: .0862}));
        const end = token.value === '(' ? ')' : ']';
        const body = this.nested(() => this.chemicalRow(item => item.kind === 'char' && item.value === end));
        this.expect(end);
        // mhchem's brackets are plain opening and closing characters: an ordinary group, with no inner spacing.
        children.push(this.node('fence', {left: token.value, right: end, body, class: 'ord'}));
        spaced = false; subAllowed = true; moleculeParts++; continue;
      }
      if (token.value === '{') {
        const body = this.nested(() => this.chemicalRow(item => item.kind === 'char' && item.value === '}'));
        this.expect('}'); children.push(body); spaced = false; subAllowed = true; continue;
      }
      if (token.value === '}' || token.value === ')' || token.value === ']') this.error('unexpected-delimiter', 'A chemical group has an unmatched delimiter.', token);
      if (token.value === '^' || token.value === '_') {
        const key = token.value === '^' ? 'sup' : 'sub';
        if (token.value === '^' && (this.rawPeek(false).kind === 'space' || this.rawPeek(false).kind === 'eof')) {
          children.push(this.literal('↑', {class: 'ord', variant: 'roman'}), this.node('space', {width: 3 / 18})); spaced = false; subAllowed = false; continue;
        }
        let body;
        if (this.is('{')) {
          const tokens = this.rawArgument(), value = mathTexTokenText(tokens).trim(), math = tokens[0]?.value === '$' && tokens.at(-1)?.value === '$';
          body = /^[A-Za-z]{2,}$/.test(value) ? this.node('text', {value, variant: 'roman'}) : this.subparse(math ? tokens.slice(1, -1) : tokens);
          // Single-letter variables and their integer expressions are math; words and oxidation numerals stay upright.
          if (math || /^\d*[a-z](?:[+\-−]\d*)?$/.test(value)) body = this.node('style', {variant: 'normal', body});
        }
        else {
          const value = consumeRun(character => /^[0-9+\-−IVX]$/.test(character));
          const variable = this.rawPeek(false).kind === 'char' && /^[a-z]$/.test(this.rawPeek(false).value);
          body = value ? this.node('text', {value: value.replace(/-/g, '−'), variant: 'roman'}) : this.argument();
          if (!value && variable) body = this.node('style', {variant: 'normal', body});
        }
        // Scripts that open a term are an isotope's mass and atomic numbers, set before the next element.
        if (spaced) {
          if (!isotope) children.push(isotope = this.node('scripts', {base: this.row([]), pre: true}));
          if (isotope[key]) this.error('duplicate-script', 'An isotope cannot have two ' + (key === 'sub' ? 'subscripts' : 'superscripts') + '.', token);
          isotope[key] = body; continue;
        }
        script(key, body); spaced = false; continue;
      }
      if (/^[0-9]$/.test(token.value)) {
        // A subscript count is whole: in CuSO4.5H2O the point is the addition dot.
        const number = token.value + consumeRun(character => subAllowed && !spaced ? /^[0-9]$/.test(character) : /^[0-9.]$/.test(character));
        // 1/2 opening a term is mhchem's text-style fraction.
        if (!(subAllowed && !spaced) && this.rawPeek(false).value === '/' && /^[0-9]$/.test(this.frames.at(-1)?.tokens[this.frames.at(-1).at + 1]?.value ?? '')) {
          this.rawTake(false);
          const denominator = consumeRun(character => /^[0-9]$/.test(character));
          children.push(this.node('frac', {num: this.node('text', {value: number, variant: 'roman'}), den: this.node('text', {value: denominator, variant: 'roman'}), bar: true, style: 'text'}));
          spaced = false; subAllowed = false; continue;
        }
        if (subAllowed && !spaced) {
          if (moleculeParts === 1 && ['+', '-'].includes(this.rawPeek(false).value)) {
            const sign = this.rawTake(false).value;
            script('sup', this.node('text', {value: number + (sign === '-' ? '−' : '+'), variant: 'roman'}));
          } else script('sub', this.node('text', {value: number, variant: 'roman'}));
        } else {
          // A coefficient keeps a thin space before its formula.
          children.push(this.node('text', {value: number, variant: 'roman'}));
          if (this.rawPeek(false).kind === 'char' && /^[A-Z(\[]$/.test(this.rawPeek(false).value)) children.push(this.node('space', {width: 3 / 18}));
        }
        spaced = false; continue;
      }
      if (token.value === '<' || token.value === '-' || token.value === '=') {
        let arrow = token.value;
        while (this.rawPeek(false).kind === 'char' && /^[<=>-]$/.test(this.rawPeek(false).value) && arrow.length < 5) arrow += this.rawTake(false).value;
        const arrows = {'->': '→', '<-': '←', '<->': '↔', '<-->': '⇄', '<=>': '⇌', '=>': '⇒', '<=': '⇐', '<<=>': '⇋', '<=>>': '⇌'};
        if (arrows[arrow]) {
          // Only an adjacent bracket labels the arrow; a peek that skips spaces would drop the next one.
          const over = this.rawPeek(false).value === '[' ? this.optionalRaw() : null, under = over && this.rawPeek(false).value === '[' ? this.optionalRaw() : null;
          // mhchem's arrow is at least 2 em, with a thick space inside each end; <-> and <--> pad a label by 18 mu.
          const base = this.literal(arrows[arrow], {class: 'rel', variant: 'roman', stretch: true}), space = () => this.node('space', {width: 5 / 18});
          // A label in braces is text, with its word spaces; otherwise it is chemistry.
          const label = tokens => {
            if (!tokens?.some(item => item.kind !== 'space')) return null;
            const inner = tokens.filter(item => item.kind !== 'space');
            if (inner[0]?.value === '{' && inner.at(-1)?.value === '}' && tokens.indexOf(inner[0]) === 0 && mathTexBalanced(inner.slice(1, -1))) return this.subparse(tokens.slice(1, tokens.lastIndexOf(inner.at(-1))), true, 'roman');
            return this.chemistry(tokens);
          };
          children.push(space(), this.node('overunder', {base, over: label(over), under: label(under), class: 'rel', minWidth: 2, unspaced: true, ...(/^<--?>$/.test(arrow) ? {labelPad: 18} : {})}), space());
          spaced = true; subAllowed = false; moleculeParts = 0; continue;
        }
        if (arrow.length !== 1) this.error('unsupported-reaction', 'Unsupported chemical reaction arrow: ' + arrow + '.', token);
        if (arrow === '-' && !spaced && subAllowed && (this.rawPeek(false).kind === 'space' || this.rawPeek(false).kind === 'eof' || /^[)\]}]$/.test(this.rawPeek(false).value))) script('sup', this.literal('−', {variant: 'roman'}));
        else children.push(this.literal(arrow, {class: spaced ? 'bin' : 'ord', variant: 'roman'}));
        spaced = false; continue;
      }
      if (token.value === '+') {
        if (!spaced && subAllowed && (this.rawPeek(false).kind === 'space' || this.rawPeek(false).kind === 'eof' || /^[)\]}]$/.test(this.rawPeek(false).value))) script('sup', this.literal('+', {variant: 'roman'}));
        else { children.push(this.literal('+', {class: 'bin', variant: 'roman'})); moleculeParts = 0; }
        spaced = false; subAllowed = false; continue;
      }
      if (/^[A-Za-z]$/.test(token.value)) {
        const word = token.value + consumeRun(character => /^[a-z]$/.test(character));
        if (word === 'v' && spaced && !isotope) { children.push(this.literal('↓', {class: 'ord', variant: 'roman'}), this.node('space', {width: 3 / 18})); spaced = false; subAllowed = false; continue; }
        const element = this.node('text', {value: word, variant: 'roman'});
        if (isotope) { isotope.base = this.node('phantom', {body: element, mode: 'v'}); isotope = null; }
        children.push(element);
        moleculeParts++; spaced = false; subAllowed = true; continue;
      }
      if (token.value === '#') children.push(this.literal('≡', {class: 'ord', variant: 'roman'}));
      // mhchem's addition dot (. or *) has a thin space on each side and starts a new formula.
      else if (token.value === '.' || token.value === '·' || token.value === '*') {
        children.push(this.node('space', {width: 3 / 18}), this.literal('⋅', {class: 'ord', variant: 'roman'}), this.node('space', {width: 3 / 18}));
        spaced = true; subAllowed = false; moleculeParts = 0; continue;
      }
      else if (token.value === '~') children.push(this.node('space', {width: 1 / 3}));
      else children.push(this.literal(token.value, {variant: 'roman'}));
      spaced = false;
    }
    return this.row(children);
  }
  // siunitx: \num groups digits, \si and \unit set units upright (macros or literal), \SI joins them, \ang marks degrees.
  // Formatting options are accepted and not reproduced.
  siunitx(name, token) {
    this.optionalRaw();
    if (name === 'num') return this.siNumber(this.rawArgument());
    if (name === 'si' || name === 'unit') return this.siUnit(this.rawArgument(), token);
    if (name === 'ang') {
      const parts = mathTexTokenText(this.rawArgument()).split(';');
      if (parts.length > 3) this.error('invalid-number', 'An angle has at most degrees, minutes and seconds.', token);
      return this.row(parts.flatMap((part, i) => part.trim() ? [this.siNumber(mathTexTokens(part.trim(), token.offset)), this.literal('°′″'[i], {variant: 'roman'})] : []));
    }
    // \numrange and \SIrange: "1 to 5", the unit after each number.
    if (/range$/.test(name)) {
      const from = this.siNumber(this.rawArgument()), to = this.siNumber(this.rawArgument()), word = {type: 'text', value: 'to', variant: 'roman'},
        unit = name === 'numrange' ? null : this.rawArgument(), quantity = value => unit ? [value, this.node('space', {width: 3 / 18}), this.siUnit(unit, token)] : [value];
      return this.row([...quantity(from), this.node('space', {width: 1 / 3}), this.node('text', word), this.node('space', {width: 1 / 3}), ...quantity(to)]);
    }
    const value = this.siNumber(this.rawArgument()), before = this.optionalRaw();
    return this.row([...(before ? [this.siUnit(before, token), this.node('space', {width: 3 / 18})] : []), value, this.node('space', {width: 3 / 18}), this.siUnit(this.rawArgument(), token)]);
  }
  siNumber(tokens) {
    const text = mathTexTokenText(tokens).replace(/\s+/g, '');
    if (!/^[-+]?(\d+[.,]?\d*|[.,]\d+)(\+-\d+[.,]?\d*)?([eE][-+]?\d+)?$/.test(text)) return this.subparse(tokens);
    const group = (digits, fromLeft) => digits.length < 5 ? digits : (fromLeft ? digits.match(/\d{1,3}/g) : digits.split('').reverse().join('').match(/\d{1,3}/g).map(part => part.split('').reverse().join('')).reverse()).join('\\,');
    const [, sign = '', whole = '', fraction, uncertainty, exponent] = /^([-+]?)(\d*)(?:[.,](\d*))?(?:\+-(\d+[.,]?\d*))?(?:[eE]([-+]?\d+))?$/.exec(text);
    const value = (sign === '-' ? '-' : sign) + (group(whole) || '0') + (fraction === undefined ? '' : '.' + group(fraction, true)) +
      (uncertainty ? '{\\pm}' + uncertainty.replace(',', '.') : '') + (exponent ? '\\times 10^{' + exponent.replace('+', '') + '}' : '');
    return this.subparse(mathTexTokens(value, tokens[0]?.offset || 0));
  }
  siUnit(tokens, token) {
    const units = MATH_SI_UNITS, prefixes = MATH_SI_PREFIXES, items = [];
    if (!tokens.some(item => item.kind === 'command' && (Object.hasOwn(units, item.value) || Object.hasOwn(prefixes, item.value) || Object.hasOwn(MATH_SI_ABBREVIATIONS, item.value) || /^(per|square|cubic|squared|cubed|tothe|raiseto)$/.test(item.value))))
      return this.node('style', {variant: 'roman', body: this.subparse(tokens.map(item => item.kind === 'char' && (item.value === '.' || item.value === '~') ? {...item, kind: 'command', value: ','} : item))});
    let prefix = '', power = 1, per = false;
    const number = at => { const group = tokens[at]?.value === '{' ? tokens.slice(at + 1, tokens.findIndex((item, i) => i > at && item.value === '}')) : [tokens[at]]; return [mathTexTokenText(group.filter(Boolean)).trim(), at + (group.length > 1 || tokens[at]?.value === '{' ? group.length + 1 : 0)]; };
    for (let at = 0; at < tokens.length; at++) {
      const item = tokens[at], value = item.value;
      if (item.kind === 'space' || item.kind === 'char' && (value === '.' || value === '~')) continue;
      if (item.kind === 'command' && Object.hasOwn(prefixes, value)) prefix += prefixes[value];
      else if (item.kind === 'command' && value === 'per') per = true;
      else if (item.kind === 'command' && (value === 'square' || value === 'cubic')) power = value === 'square' ? 2 : 3;
      else if (item.kind === 'command' && /^(squared|cubed|tothe|raiseto)$/.test(value) && items.length) {
        let exponent = value === 'squared' ? '2' : '3';
        if (value === 'tothe' || value === 'raiseto') [exponent, at] = number(at + 1);
        if (!/^-?\d+(\.\d+)?$/.test(exponent)) this.error('invalid-unit', 'A unit power must be a number.', item);
        items.at(-1).power = exponent;
      } else if (item.kind === 'char' && value === '/' && items.length) items.at(-1).slash = true;
      else if (item.kind === 'command' && (Object.hasOwn(units, value) || !prefix && Object.hasOwn(MATH_SI_ABBREVIATIONS, value)) || item.kind === 'char' && /^[A-Za-z]$/.test(value)) {
        items.push({symbol: prefix + (item.kind === 'command' ? units[value] ?? MATH_SI_ABBREVIATIONS[value] : value), power: String(power), per});
        prefix = ''; power = 1; per = false;
      } else this.error('invalid-unit', 'Unsupported unit: ' + mathTexTokenText([item]).trim() + '.', item);
    }
    if (prefix || per || !items.length || items.at(-1).slash) this.error('invalid-unit', 'A unit prefix, \\per or / needs a unit.', token);
    // A unit after a written solidus follows it directly: m/s.
    return this.row(items.flatMap((unit, i) => {
      const exponent = (unit.per ? '−' : '') + unit.power.replace('-', '−'), base = this.node('text', {value: unit.symbol, variant: 'roman'});
      return [...(i && !items[i - 1].slash ? [this.node('space', {width: 3 / 18})] : []), exponent === '1' ? base : this.node('scripts', {base, sup: this.node('text', {value: exponent, variant: 'roman'})}),
        ...(unit.slash ? [this.literal('/', {variant: 'roman'})] : [])];
    }));
  }
  units(tokens) {
    let value = mathTexTokenText(tokens);
    value = value.replace(/(\d(?:[\d.]*\d)?)[eE]([+-]?\d+)/g, '$1\\times 10^{$2}');
    value = value.replace(/([A-Za-zµΩ°]+)([-+]\d+)/g, '$1^{$2}');
    value = value.replace(/\s+/g, '\\,');
    const parser = new MathTexParser(this.source, {tokens: mathTexTokens(value, tokens[0]?.offset || 0), scopes: this.scopes, budget: this.budget, colors: this.colors});
    return this.node('style', {variant: 'roman', body: parser.parse()});
  }

  mathmlToken(token) {
    const kind = this.plainArgument(), attributes = this.optionalRaw(), text = this.plainArgument();
    if (!['mi', 'mn', 'mo', 'mtext'].includes(kind)) this.error('unsupported-token', 'Unsupported mathematical token kind: ' + kind + '.', token);
    let variant = kind === 'mi' ? 'normal' : 'roman';
    if (attributes) {
      const value = mathTexTokenText(attributes).trim(), match = /^mathvariant\s*=\s*["']([a-z-]+)["']$/.exec(value);
      const variants = new Set(['normal', 'bold', 'italic', 'bold-italic', 'double-struck', 'script', 'bold-script', 'fraktur', 'bold-fraktur', 'sans-serif', 'bold-sans-serif', 'sans-serif-italic', 'sans-serif-bold-italic', 'sans-serif-bold', 'monospace']);
      if (!match || !variants.has(match[1])) this.error('unsupported-attribute', 'Only a mathematical font variant is supported on a token.', token);
      variant = match[1] === 'normal' ? 'roman' : match[1] === 'bold-sans-serif' ? 'sans-serif-bold' : match[1];
    }
    return this.node('style', {variant, tokenKind: kind, tokenText: text, body: kind === 'mtext' ? this.node('text', {value: text, variant}) : this.row([...text].map(value => this.literal(value, {variant})))});
  }
  character(name, token) {
    let raw;
    if (name === 'unicode') {
      const metrics = this.optionalRaw(), font = this.optionalRaw();
      if (metrics || font) this.error('unsupported-character-option', 'Unicode characters use the embedded math font.', token);
      raw = this.plainArgument();
    } else if (this.is('{')) raw = this.plainArgument();
    else {
      let prefix = '';
      if (this.is('"') || this.is("'")) prefix = this.take().value;
      raw = prefix;
      while (this.peek().kind === 'char' && (prefix === '"' ? /^[0-9a-fA-F]$/ : prefix === "'" ? /^[0-7]$/ : /^[0-9]$/).test(this.peek().value)) raw += this.take().value;
    }
    if (!/^(?:(?:x|0x|U\+|\")[0-9a-f]+|'[0-7]+|[0-9]+)$/i.test(raw)) this.error('invalid-character', 'Invalid Unicode character number.', token);
    const value = /^(?:x|0x|U\+|\")/i.test(raw) ? parseInt(raw.replace(/^(?:0x|U\+|x|\")/i, ''), 16) : raw.startsWith("'") ? parseInt(raw.slice(1), 8) : Number(raw);
    if (!Number.isInteger(value) || value < 32 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) this.error('invalid-character', 'Invalid Unicode character number.', token);
    return this.literal(String.fromCodePoint(value));
  }
}

function parseMathTex(source) {
  if (typeof source !== 'string') throw new MathTexError('invalid-source', 'The mathematical source must be text.');
  if (source.length > 1000000) throw new MathTexError('resource-limit', 'This formula is too long to render safely.');
  return new MathTexParser(source).parse();
}

// While a person types, a formula is unfinished where they are typing. Preview mends it there: a half-typed command
// before the caret waits (blanked, so later offsets hold), a missing argument shows a placeholder box, and groups,
// options, fences and environments left open at the end close. Any other fault stays a fault.
function parseMathTexPreview(source, error, caret = source.length) {
  if (source.length > 4096) return null;
  caret = Math.max(0, Math.min(source.length, Math.floor(caret) || 0));
  let text = source;
  const tail = /(?<!\\)\\(?:[A-Za-z]*|(?:begin|end)\{[A-Za-z*]*)$/.exec(text.slice(0, caret));
  // A name being typed previews blank; a finished misspelling (no known name continues it) keeps its fix.
  if (tail && error?.code === 'unsupported-command' && error.offset === tail.index && /^\\[A-Za-z]+$/.test(tail[0])) {
    const name = tail[0].slice(1), suggestion = mathSuggest(name);
    if (suggestion && !mathTexNames.command.some(candidate => candidate.length > name.length && candidate.startsWith(name))) return null;
  }
  if (tail) text = text.slice(0, tail.index) + ' '.repeat(tail[0].length) + text.slice(caret);
  const atEnd = (cause, length) => /^unclosed-(group|option|environment)$/.test(cause.code) || cause.offset >= length;
  for (let attempt = 0; attempt < 24; attempt++) {
    try { return new MathTexParser(text).parse(); } catch (cause) { error = cause; }
    if (error.code === 'missing-argument' && error.offset < text.length) { text = text.slice(0, error.offset) + '{\\square}' + text.slice(error.offset); continue; }
    if (!atEnd(error, text.length)) return null;
    if (/[\^_]$/.test(text)) { text += '{\\square}'; continue; }
    if (/[{[]$/.test(text)) { text += '\\square'; continue; }
    const open = [...text.matchAll(/\\(begin|end)\{([A-Za-z*]+)\}/g)].reduce((stack, [, kind, name]) => (kind === 'begin' ? stack.push(name) : stack.pop(), stack), []).at(-1);
    const expected = /^Expected (.+)\.$/.exec(error.message)?.[1], fixes = ['}', ']', '\\right.', ...(open ? ['\\end{' + open + '}'] : []), '$', '{\\square}'];
    const first = error.code === 'unclosed-option' ? ']' : error.code === 'missing-argument' ? '{\\square}' : error.code === 'unclosed-environment' && open ? '\\end{' + open + '}' : expected && fixes.includes(expected === '\\right' ? '\\right.' : expected) ? (expected === '\\right' ? '\\right.' : expected) : '}';
    let next = null;
    for (const fix of [first, ...fixes.filter(fix => fix !== first)]) {
      try { return new MathTexParser(text + fix).parse(); }
      catch (cause) { if (!next && atEnd(cause, text.length + fix.length)) next = text + fix; }
    }
    if (!next) return null;
    text = next;
  }
  return null;
}

// The command or environment a mistyped name most likely meant: one edit away (two for longer names), where swapping
// two neighbouring letters is one edit.
const MATH_TEX_STRUCTURE = 'enclose multicolumn hdotsfor intertext frac dfrac tfrac cfrac binom dbinom tbinom genfrac sqrt root left right middle big Big bigg Bigg bigl bigr Bigl Bigr begin end text textbf textit mathrm mathbf operatorname overset underset stackrel buildrel xrightarrow xleftarrow not phantom smash hspace quad qquad color textcolor mathcolor colorbox boxed cancel newcommand renewcommand def ce pu SI si num unit ang SIrange numrange qtyrange dv pdv qty abs norm bra ket braket substack tag label href';
// Every other command the parser accepts: a name being typed toward one of them is not a misspelling.
const MATH_TEX_OTHER = 'TeX let char over LaTeX Set unicode bbox matrix pmatrix bmatrix Bmatrix vmatrix Vmatrix smallmatrix cases atop choose brace brack above overwithdelims atopwithdelims abovewithdelims limits nolimits displaylimits long strut operatornamewithlimits mathop stackbin overunderset xlongequal hphantom vphantom mathstrut rlap llap clap mathrlap mathllap mathclap mspace kern mkern hskip mskip rule raise raisebox lower fcolorbox definecolor fbox bcancel xcancel sout cancelto providecommand gdef edef xdef DeclareMathOperator DeclarePairedDelimiter global outer require url notag nonumber relax allowbreak nobreak protect displaystylelimits mathopen mathclose mathbin mathrel mathord mathinner mathpunct Bra Ket Braket set nicefrac sfrac vcenter prescript sideset accentset underaccent slashed mod bmod pmod pod smashoperator mathmakebox idotsint mmlToken textbackslash textasciitilde textasciicircum mathchoice verb';
let mathTexNames;
function mathSuggest(name, environment = false) {
  if (typeof name !== 'string' || name.length < 2 || name.length > 32) return undefined;
  mathTexNames ||= {command: [...new Set([...MATH_TEX_STRUCTURE.split(' '), ...MATH_TEX_OTHER.split(' '), ...Object.keys(MATH_SYMBOLS), ...Object.keys(MATH_TEX_VARIANTS), ...Object.keys(MATH_TEX_TEXT_VARIANTS),
    ...Object.keys(MATH_TEX_ACCENTS), ...Object.keys(MATH_TEX_DECLARATIONS), ...Object.keys(MATH_TEX_COLONS), ...MATH_TEX_PHYSICS, ...MATH_NAMED_OPERATORS, ...MATH_LIMIT_OPERATORS, ...Object.keys(MATH_TEX_SPACES), ...Object.keys(MATH_TEX_LONG_ARROWS)])], environment: [...MATH_TEX_ENVIRONMENTS]};
  const limit = name.length > 5 ? 2 : 1;
  let best, bestDistance = limit + 1;
  for (const candidate of mathTexNames[environment ? 'environment' : 'command']) {
    if (Math.abs(candidate.length - name.length) > limit) continue;
    const d = Array.from({length: name.length + 1}, (_, i) => [i, ...Array(candidate.length).fill(0)]);
    for (let j = 1; j <= candidate.length; j++) d[0][j] = j;
    for (let i = 1; i <= name.length; i++) for (let j = 1; j <= candidate.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (name[i - 1] === candidate[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && name[i - 1] === candidate[j - 2] && name[i - 2] === candidate[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    if (d[name.length][candidate.length] < bestDistance) { best = candidate; bestDistance = d[name.length][candidate.length]; }
  }
  return best === undefined ? undefined : (environment ? best : '\\' + best);
}

// SPDX-License-Identifier: MIT
// Source custody and bounded diagnostics shared by SVG and MathML.
function mathSourceUTF16(source) {
  // Four ASCII hex digits retain each original UTF-16 code unit across XML/HTML hosts.
  const encoded=[],parts=[];
  for(let i=0;i<source.length;i++) {
    parts.push(source.charCodeAt(i).toString(16).padStart(4,'0'));
    if(parts.length===1024) {encoded.push(parts.join(''));parts.length=0;}
  }
  encoded.push(parts.join(''));
  return encoded.join('');
}

function mathSourceAlternative(source) {
  const alternatives=[],parts=[];
  let first=-1,kept=0,hasCR=false;
  for(let i=0;i<source.length;i++) {
    const code=source.charCodeAt(i);
    if(code===13)hasCR=true;
    if(code>=0xd800 && code<=0xdbff && i+1<source.length) {
      const next=source.charCodeAt(i+1);
      if(next>=0xdc00 && next<=0xdfff) {i++;continue;}
    }
    if((code>=0x20 && code<=0xd7ff) || (code>=0xe000 && code<=0xfffd) || code===9 || code===10 || code===13)continue;
    if(first<0)first=i;
    if(i>kept)parts.push(source.slice(kept,i));
    parts.push('\\u'+code.toString(16).toUpperCase().padStart(4,'0'));kept=i+1;
    // Flatten small batches instead of retaining one rope node per bad code unit.
    if(parts.length>=1024) {alternatives.push(parts.join(''));parts.length=0;}
  }
  if(first<0)return {alternative:source,...(hasCR?{utf16:mathSourceUTF16(source)}:{})};
  parts.push(source.slice(kept));alternatives.push(parts.join(''));
  return {alternative:alternatives.join(''),utf16:mathSourceUTF16(source),error:{code:'invalid-source-character',offset:first,
    message:'A source character cannot be embedded in XML. The text alternative shows Unicode escapes; the UTF-16 carrier keeps the original source.'}};
}

function mathAdmitSource(text) {
  // Reject before scanning, escaping, parsing or constructing a source carrier.
  return text.length>1000000?{alternative:'Formula source omitted: source limit exceeded.',error:{
    code:'resource-limit',offset:0,sourceOmitted:true,
    message:'This formula is too long to render safely. Its source was not embedded; retain the original input.'
  }}:mathSourceAlternative(text);
}

function mathDiagnostic(cause) {
  const message=String(cause?.message ?? cause),code=cause?.code,rawCommand=cause?.command;
  const error={code:typeof code==='string'?code:'invalid-tex',message:message.length>1024?message.slice(0,1024).replace(/[\ud800-\udbff]$/,'')+'…':message,
    offset:Number.isFinite(cause?.offset)?cause.offset:0};
  if(message.length>1024 || cause?.messageTruncated)error.messageTruncated=true;
  if(cause?.sourceOmitted)error.sourceOmitted=true;
  const suggestion=cause?.suggestion ?? (cause?.code==='unsupported-command'?mathSuggest(cause.command):cause?.code==='unsupported-environment'?mathSuggest(cause.environment,true):undefined);
  if(suggestion)error.suggestion=suggestion;
  if(rawCommand!==undefined) {
    const command=String(rawCommand);
    error.command=command.slice(0,128).replace(/[\ud800-\udbff]$/,'');
    if(command.length>128 || cause.commandTruncated)error.commandTruncated=true;
  }
  return error;
}

function mathPrepare(source, options) {
  const text = String(source ?? ''), safe = mathAdmitSource(text);
  let tree, error = safe.error;
  if (!error) try { tree = parseMathTex(text); } catch (cause) {
    tree = options?.preview ? parseMathTexPreview(text, cause, options.caret ?? text.length) : null;
    if (!tree) { tree = undefined; error = mathDiagnostic(cause); }
  }
  return {text, safe, tree, error};
}

// SPDX-License-Identifier: MIT
// Unicode mathematical alphabets shared by SVG and MathML. No font lookup.
const MATH_STYLED_RANGES = {
  italic: [0x1d434, 0x1d44e, null], bold: [0x1d400, 0x1d41a, 0x1d7ce],
  'bold-italic': [0x1d468, 0x1d482, 0x1d7ce], script: [0x1d49c, 0x1d4b6, null],
  'bold-script': [0x1d4d0, 0x1d4ea, null], fraktur: [0x1d504, 0x1d51e, null],
  'bold-fraktur': [0x1d56c, 0x1d586, null], 'double-struck': [0x1d538, 0x1d552, 0x1d7d8],
  'sans-serif': [0x1d5a0, 0x1d5ba, 0x1d7e2], 'sans-serif-bold': [0x1d5d4, 0x1d5ee, 0x1d7ec],
  'sans-serif-italic': [0x1d608, 0x1d622, null], 'sans-serif-bold-italic': [0x1d63c, 0x1d656, 0x1d7ec],
  monospace: [0x1d670, 0x1d68a, 0x1d7f6],
};
const MATH_STYLED_LEGACY = {
  italic: {104: 0x210e},
  script: {66:0x212c,69:0x2130,70:0x2131,72:0x210b,73:0x2110,76:0x2112,77:0x2133,82:0x211b,101:0x212f,103:0x210a,111:0x2134},
  fraktur: {67:0x212d,72:0x210c,73:0x2111,82:0x211c,90:0x2128},
  'double-struck': {67:0x2102,72:0x210d,78:0x2115,80:0x2119,81:0x211a,82:0x211d,90:0x2124},
};
const MATH_STYLED_GREEK = {bold:0x1d6a8, italic:0x1d6e2, 'bold-italic':0x1d71c, 'sans-serif-bold':0x1d756, 'sans-serif-bold-italic':0x1d790};
const MATH_STYLED_GREEK_SPECIAL = [0x2207,0x2202,0x3f5,0x3d1,0x3f0,0x3d5,0x3f1,0x3d6];
function mathStyledCodePoint(cp, variant) {
  if (variant === 'normal') variant = 'italic';
  if (MATH_STYLED_LEGACY[variant]?.[cp] !== undefined) return MATH_STYLED_LEGACY[variant][cp];
  const r = MATH_STYLED_RANGES[variant];
  if (r) {
    if (cp >= 65 && cp <= 90) return r[0] + cp - 65;
    if (cp >= 97 && cp <= 122) return r[1] + cp - 97;
    if (r[2] && cp >= 48 && cp <= 57) return r[2] + cp - 48;
  }
  const greek = MATH_STYLED_GREEK[variant];
  if (greek !== undefined) {
    if (cp >= 0x391 && cp <= 0x3a9 && cp !== 0x3a2) return greek + cp - 0x391;
    if (cp >= 0x3b1 && cp <= 0x3c9) return greek + 26 + cp - 0x3b1;
    const special = MATH_STYLED_GREEK_SPECIAL.indexOf(cp);
    if (special === 0) return greek + 25;
    if (special > 0) return greek + 50 + special;
  }
  return cp;
}

// SPDX-License-Identifier: MIT
// Boxes use ems, a baseline at y=0 and a downward SVG axis. Font outlines stay in font units.
const mathNumber = n => {
  if (!Number.isFinite(n)) throw new Error('Math geometry is not finite');
  const scaled = n * 1e6;
  return String((Number.isFinite(scaled) ? Math.round(scaled) / 1e6 : n) || 0);
};
const mathEscape = s => String(s).replace(/[&<>"'\t\n\r]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','\t':'&#9;','\n':'&#10;','\r':'&#13;'}[c]));
const mathFontRatio = (MATH_FONT.textXHeight / MATH_FONT.textUnits) / (MATH_FONT.xHeight / MATH_FONT.units);
function mathScale(c) {
  if (!c.level) return c.size;
  const scale = MATH_FONT.constants[c.level === 1 ? 'ScriptPercentScaleDown' : 'ScriptScriptPercentScaleDown'] / 100;
  return c.size * (c.screen ? Math.max(scale, Math.min(1, (c.level === 1 ? 12 : 10) / c.screen.fontSize)) : scale);
}

function mathScreenStroke(c, scale) {
  if (!c.screen) return 0;
  const {fontSize, pixelRatio, dark} = c.screen, size = fontSize * (scale ?? mathScale(c));
  if (!(size > 0)) return 0;
  const small = Math.max(0, Math.min(1, (32 - size) / 16));
  const hairline = MATH_FONT.constants.FractionRuleThickness / MATH_FONT.units * size;
  return small * ((dark ? .18 : .09) / Math.sqrt(pixelRatio) + Math.max(0, (dark ? 1 : .85) / pixelRatio - hairline) * .35) / fontSize;
}
const mathConstant = (name, c, fallback) => (MATH_FONT.constants[name] ?? fallback * MATH_FONT.units) / MATH_FONT.units * mathScale(c);
const mathScriptStyle = (c, cramped = c.cramped) => ({...c, level: Math.min(2, c.level + 1), display: false, cramped});
const mathScreenRelayout = (n,c,ratio) => mathLayout(n,{...c,screen:{...c.screen,fontSize:c.screen.fontSize*ratio},cache:new WeakMap()});
const mathBox = (w = 0, h = 0, d = 0, svg = '', extra = {}) => ({w, h, d, svg, left: 0, right: w, inkTop: -h, inkBottom: d, class: 'ord', ...extra});
const mathMove = (b, x, y) => !b.svg || x === 0 && y === 0 ? b.svg : '<g transform="translate(' + mathNumber(x) + ' ' + mathNumber(y) + ')">' + b.svg + '</g>';

function mathCompose(items, width, extra = {}) {
  let h = 0, d = 0, left = 0, right = width, inkTop=Infinity, inkBottom=-Infinity, svg = '';
  for (const [b, x, y] of items) {
    if(svg.length+b.svg.length+128>8*1024*1024)throw Object.assign(new Error('Mathematical composition exceeds the SVG budget'),{code:'resource-limit'});
    h = Math.max(h, b.h - y); d = Math.max(d, b.d + y);
    left = Math.min(left, x + b.left); right = Math.max(right, x + b.right);
    if(b.svg) {inkTop=Math.min(inkTop,b.inkTop+y);inkBottom=Math.max(inkBottom,b.inkBottom+y);}
    svg += mathMove(b, x, y);
  }
  const single=items.length===1?items[0]:null,b=single?.[0];
  const glyph=b?.glyph===undefined?{}:{glyph:b.glyph,unitScale:b.unitScale,glyphX:(b.glyphX || 0)+single[1],glyphY:(b.glyphY || 0)+single[2],extended:b.extended,scriptBase:b.scriptBase,stroke:b.stroke};
  return mathBox(width, h, d, svg, {left, right, inkTop:Number.isFinite(inkTop)?inkTop:-h, inkBottom:Number.isFinite(inkBottom)?inkBottom:d,...glyph,...extra});
}

function mathGlyphIndex(id, c, extra = {}) {
  if(c.dotless)id=MATH_FONT.dotless?.[id] ?? id;
  const alternates=MATH_FONT.scriptAlternates[id],scale=mathScale(c);
  const pixels=c.screen?c.screen.fontSize*scale:Infinity,
    optical=Math.max(c.level,pixels<10?2:pixels<15?1:0);
  if(optical && alternates)id=alternates[Math.min(optical,alternates.length)-1];
  const g = MATH_FONT.glyph(id), s = scale / MATH_FONT.units, stroke = mathScreenStroke(c,scale), radius = stroke / 2;
  if (!g) throw Object.assign(new Error('Unsupported mathematical glyph'), {code:'unsupported-glyph'});
  if(c.budget) {
    c.budget.outlineBytes=(c.budget.outlineBytes || 0)+g[7].length+96;
    if(c.budget.outlineBytes>4*1024*1024)throw Object.assign(new Error('Mathematical outlines exceed the rendering budget'),{code:'resource-limit'});
  }
  // A synthetic bold strokes the outline 0.03 em wide and adds 0.06 em of advance; a synthetic italic slants 14 degrees.
  const bold = extra.embolden ? 0.03 * scale : 0, slope = extra.slant ? 0.25 : 0, pen = stroke + bold;
  let svg = g[7] ? '<path d="' + g[7] + '" transform="scale(' + mathNumber(s) + ' ' + mathNumber(-s) + ')"'+
    (c.screen ? ' data-math-ink="' + mathNumber(scale) + '"' : '') +
    (pen ? ' stroke="currentColor" stroke-width="' + mathNumber(pen / s) + '" stroke-linejoin="round" paint-order="stroke fill"' : '') + '/>' : '';
  if (svg && (bold || slope)) svg = '<g transform="translate(' + mathNumber(bold) + ' 0)' + (slope ? ' skewX(-14.04)' : '') + '">' + svg + '</g>';
  const {embolden, slant, ...rest} = extra, r = pen / 2;
  return mathBox(g[0] * s + 2 * bold, Math.max(0, g[4] * s + r), Math.max(0, -g[2] * s + r), svg,
    {left: Math.min(0,g[1]*s-r+bold+slope*g[2]*s), right: Math.max(g[0]*s+2*bold,g[3]*s+r+bold+slope*g[4]*s), inkTop:-g[4]*s-r, inkBottom:-g[2]*s+r, italic: g[5]*s+slope*g[4]*s*0.5, stroke: pen || undefined,
      accent: (g[6] == null ? g[0]*s/2 : g[6]*s)+bold+slope*g[4]*s*0.5,glyph:bold || slope?undefined:id,unitScale:s,glyphX:0,glyphY:0,extended:!!MATH_FONT.extendedShapes[id],...rest});
}

function mathGlyph(value, c, extra = {}) {
  const cp = value.codePointAt(0);
  if (value.length !== (cp > 0xffff ? 2 : 1)) return mathText(value, c, extra);
  const variant = extra.variant || c.variant, mapped = mathStyledCodePoint(cp, variant);
  const styled = MATH_FONT.styledGlyphs[variant]?.[cp];
  if (styled !== undefined) return mathGlyphIndex(styled, c, extra);
  // A styled dotless i or j is the styled letter's dotless form (Unicode has italic ones only).
  const dotless = (cp === 0x1d6a4 || cp === 0x1d6a5) && !/^(normal|italic|roman)$/.test(variant) ? MATH_FONT.dotless[MATH_FONT.chars[mathStyledCodePoint(cp - 0x1d6a4 + 105, variant)]] : undefined;
  if (mapped === cp && !dotless && !/^(normal|roman)$/.test(variant)) {
    const composed = mathStyledLetter(value, c, extra, variant);
    if (composed) return composed;
  }
  const id = dotless ?? MATH_FONT.chars[mapped] ?? MATH_FONT.chars[cp];
  // A letter Unicode gives no bold or italic form (ø, ß, æ, þ) is the font's letter emboldened or slanted.
  if (id !== undefined && mapped === cp && !dotless && /bold|italic/.test(variant || '') && !/script|fraktur|double/.test(variant) && /\p{L}/u.test(value))
    return mathGlyphIndex(id, c, {...extra, embolden: /bold/.test(variant), slant: /italic/.test(variant)});
  if (id === undefined) {
    const composed = mathFallbackGlyph(value, c, extra);
    if (composed) return composed;
    if (MATH_HOST_TEXT.test(value)) return mathHostText(value, c, {...extra, host: true});
    const e = new Error('Unsupported character U+' + cp.toString(16).toUpperCase());
    e.code = 'unsupported-glyph'; e.command = value; throw e;
  }
  return mathGlyphIndex(id, c, extra);
}

// A styled accented letter (bold é) has no styled code point: draw its styled base letter with the font's
// combining marks, as an accent sits on a letter; a mark below hangs from the baseline.
function mathStyledLetter(value, c, extra, variant) {
  // The font has no combining cedilla or ogonek; their spacing forms hang from the baseline the same way.
  const [base, ...marks] = [...value.normalize('NFD')].map(m => MATH_FONT.chars[m.codePointAt(0)] === undefined ? {'\u0327': '¸', '\u0328': '˛'}[m] || m : m);
  const cp = base.codePointAt(0);
  if (!marks.length || mathStyledCodePoint(cp, variant) === cp || !marks.every(m => (/\p{M}/u.test(m) || '¸˛'.includes(m)) && MATH_FONT.chars[m.codePointAt(0)] !== undefined)) return null;
  const glyphs = marks.map(m => mathGlyph(m, c, {variant: 'roman'})), above = glyphs.some(a => a.inkBottom <= 0);
  const b = mathGlyph(base, {...c, dotless: above && /^[ij]$/.test(base)}, extra), items = [[b,0,0]];
  let top = -Math.max(0, b.h - mathConstant('AccentBaseHeight', c, 0.45));
  for (const a of glyphs) {
    const over = a.inkBottom <= 0, x = (over ? b.accent ?? b.w/2 : b.w/2) - (a.accent ?? a.w/2);
    items.push([a, x, over ? top : 0]);
    if (over) top -= a.inkBottom - a.inkTop;
  }
  return mathCompose(items, b.w, {...extra, italic: b.italic, accent: b.accent, glyph: undefined});
}

// Letters, digits, marks and symbols outside the embedded font (CJK, Cyrillic, emoji...) use the reader's
// own serif font. Their advance is estimated, and textLength fits the drawn run to that box exactly.
const MATH_HOST_TEXT = /^[\p{L}\p{N}\p{M}\p{S}\p{P}]+$/u;
const MATH_WIDE_TEXT = /[\p{sc=Han}\p{sc=Hang}\p{sc=Hira}\p{sc=Kana}\p{Emoji_Presentation}\u3000-\u303f\uff01-\uff60]/u;
function mathHostText(value, c, extra = {}) {
  const s = mathScale(c);
  let w = 0;
  for (const ch of value) if (!/\p{M}/u.test(ch)) w += (MATH_WIDE_TEXT.test(ch) ? 1 : /\p{Lu}/u.test(ch) ? 0.72 : 0.52) * s;
  const variant = c.variant || '';
  return mathBox(w, 0.8 * s, 0.2 * s, '<text font-family="' + (/sans/.test(variant) ? 'sans-serif' : variant === 'monospace' ? 'monospace' : 'serif') + '"' +
    (/bold/.test(variant) ? ' font-weight="bold"' : '') + (/italic/.test(variant) ? ' font-style="italic"' : '') +
    ' font-size="' + mathNumber(s) + '" textLength="' + mathNumber(w) +
    '" lengthAdjust="spacingAndGlyphs">' + mathEscape(value) + '</text>', {inkTop: -0.8 * s, inkBottom: 0.2 * s, ...extra});
}

// One word of text: a run of host-font characters stays one text element, keeping its shaping and joining.
function mathTextWord(value, text) {
  const items = []; let x = 0, run = '';
  const flush = () => { if (run) { const b = mathHostText(run, text); items.push([b,x,0]); x += b.w; run = ''; } };
  for (const ch of value) {
    if (run && /\p{M}/u.test(ch)) { run += ch; continue; }
    const b = mathGlyph(ch, text);
    // LaTeX's visible verbatim space retains its TFM box around the same Mono outline.
    if(text.verbatim && ch==='␣')Object.assign(b,{h:79/360*mathScale(text),d:1/9*mathScale(text)});
    if (b.host) { run += ch; continue; }
    flush(); items.push([b,x,0]); x += b.w;
  }
  flush();
  return mathCompose(items,x);
}

// A word's direction from its first strong letter; a word without letters is a number or neutral.
const MATH_RTL = /[\p{sc=Hebrew}\p{sc=Arabic}\p{sc=Syriac}\p{sc=Thaana}\p{sc=Nko}\p{sc=Samaritan}\p{sc=Mandaic}\p{sc=Adlam}\p{sc=Hanifi_Rohingya}]/u;
const mathWordDirection = word => {
  for (const ch of word) if (/\p{L}/u.test(ch)) return MATH_RTL.test(ch) ? 'R' : 'L';
  return /\p{Nd}/u.test(word) ? 'N' : null;
};

function mathText(value, c, extra = {}) {
  // Ordinary text collapses ASCII spaces; TeX ties and verbatim spaces retain each advance.
  const text = {...c, variant: extra.variant || 'roman',verbatim:!!extra.verbatim}, space = mathScale(c)*(text.variant==='monospace'?.525:1/3), words = [];
  // Letters (with their marks and joiners), numbers and punctuation are separate pieces of a word.
  for (const part of String(value).match(/[ \t\r\n]+|\s|[\p{L}\p{M}\p{Cf}]+|\p{Nd}+(?:[.,]\p{Nd}+)*|[^\s\p{L}\p{M}\p{Cf}\p{Nd}]+/gu) || [])
    words.push(/^\s+$/u.test(part) ? {w: part === '\u2009' ? mathScale(c)/6 : space, dir: null} : {box: mathTextWord(part, text), dir: mathWordDirection(part)});
  // The Unicode bidirectional algorithm in a left-to-right line: a number after right-to-left words joins them,
  // as does a neutral between two of them; each right-to-left run reads from the right.
  let strong = 'L';
  for (const word of words) {
    if (word.dir === 'R' || word.dir === 'L') strong = word.level = word.dir;
    else if (word.dir === 'N') word.level = strong;
  }
  for (let i = 0; i < words.length; i++) if (!words[i].level) {
    let j = i; while (j < words.length && !words[j].level) j++;
    const level = words[i - 1]?.level === 'R' && words[j]?.level === 'R' ? 'R' : 'L';
    for (; i < j; i++) words[i].level = level;
    i--;
  }
  const order = [];
  for (let i = 0; i < words.length;) {
    let j = i; while (j < words.length && words[j].level === words[i].level) j++;
    const run = words.slice(i, j);
    order.push(...(words[i].level === 'R' ? run.reverse() : run)); i = j;
  }
  const items = []; let x = 0;
  for (const word of order) { if (word.box) items.push([word.box,x,0]); x += word.box ? word.box.w : word.w; }
  return mathCompose(items,x,{...extra,class:extra.class || 'ord'});
}

function mathRule(w, thickness, y = 0) {
  return mathBox(w, Math.max(0, -y), Math.max(0,y+thickness),
    '<path data-math-rule="" d="M0 ' + mathNumber(y) + 'H' + mathNumber(w) + 'v' + mathNumber(thickness) + 'H0Z"/>',{inkTop:y,inkBottom:y+thickness});
}

function mathStretch(value, target, c, horizontal = false, accent = false, exact = false) {
  if (!value || value === '.') return mathBox();
  const cp = value.codePointAt(0), id = MATH_FONT.chars[cp];
  if (id === undefined) return mathFallbackGlyph(value,c,{variant:'roman',stretchTarget:target,
    stretchAxis:horizontal?'horizontal':'vertical'}) || mathGlyph(value,c,{variant:'roman'});
  // Combining accents have no text advance; stretching uses their actual font extent.
  const shape = (glyph, advance) => {
    const b = mathGlyphIndex(glyph,c);
    if (!horizontal || b.w !== 0) return b;
    const g = MATH_FONT.glyph(b.glyph), unit = b.unitScale, x = -g[1] * unit;
    const width = (advance ?? g[3] - g[1]) * unit;
    return mathCompose([[b,x,0]],width,{italic:b.italic,accent:b.accent+x});
  };
  const natural = shape(id);
  const construction = (horizontal ? MATH_FONT.horizontal : MATH_FONT.vertical)[id];
  const extent = b => horizontal ? b.w : b.inkBottom-b.inkTop;
  if (extent(natural) >= target) return natural;
  if (!construction) {
    if(!horizontal || natural.w<=0)return natural;
    const ratio=target/natural.w;
    return {...natural,w:target,left:natural.left*ratio,right:natural.right*ratio,accent:(natural.accent ?? natural.w/2)*ratio,
      svg:'<g transform="scale('+mathNumber(ratio)+' 1)">'+natural.svg+'</g>',glyph:undefined};
  }
  let last = natural;
  // An extensible arrow over a label is built to the label's width, as TeX's arrow fill is, not to the next designed size.
  for (const [glyph,advance] of exact && construction.assembly?.parts?.some(p=>p[4]) ? [] : construction.variants || []) {
    const next = shape(glyph,advance), size = horizontal ? next.w : advance * mathScale(c) / MATH_FONT.units;
    // LuaTeX tests a horizontal variant's advance, not the variant record's ink span.
    if (accent && size > target) return last;
    last = next;
    if (size >= target) return last;
  }
  const a = construction.assembly;
  if (!a?.parts?.length || !a.parts.some(p=>p[4])) return last;
  const unit = mathScale(c)/MATH_FONT.units, wanted = target/unit;
  const minOverlap = MATH_FONT.minConnectorOverlap || 0;
  const extenders=a.parts.filter(p=>p[4]),fixed=a.parts.filter(p=>!p[4]),
    fixedAdvance=fixed.reduce((sum,p)=>sum+p[3],0),growth=extenders.reduce((sum,p)=>sum+p[3]-minOverlap,0);
  if(growth<=0)return last;
  const repeats=Math.max(0,Math.ceil((wanted-fixedAdvance+minOverlap*(fixed.length-1))/growth));
  if (repeats >= 2048) throw Object.assign(new Error('Mathematical delimiter is too large'),{code:'resource-limit'});
  const pieces=a.parts.flatMap(p=>p[4]?Array.from({length:repeats},()=>p):[p]),
    full=pieces.reduce((sum,p)=>sum+p[3],0),connections=pieces.slice(1).map((p,i)=>Math.min(pieces[i][2],p[1]));
  if(connections.some(overlap=>overlap<minOverlap))return last;
  const overlap=connections.length?Math.max(minOverlap,Math.min((full-wanted)/connections.length,...connections)):0,
    length=(full-overlap*connections.length)*unit;
  const items=[]; let pos=0, width=0;
  for (let i=0;i<pieces.length;) {
    const p=pieces[i], b=mathGlyphIndex(p[0],c), g=MATH_FONT.glyph(b.glyph);
    let k=1; while(p[4] && pieces[i+k]===p)k++;
    // One extender drawn along its axis replaces k abutting copies, whose antialiased seams read as dashes.
    const span=(k*p[3]-(k-1)*overlap)*unit,f=span/(p[3]*unit);
    if (k===1) items.push(horizontal?[b,pos,0]:[b,0,-pos+g[2]*unit]);
    else if (horizontal) items.push([{...b,w:b.w*f,left:b.left*f,right:b.right*f,svg:'<g transform="scale('+mathNumber(f)+' 1)">'+b.svg+'</g>'},pos,0]);
    else items.push([{...b,h:pos+span,d:0,inkTop:-pos-span,inkBottom:-pos,
      svg:'<g transform="translate(0 '+mathNumber(-pos)+') scale(1 '+mathNumber(f)+') translate(0 '+mathNumber(g[2]*unit)+')">'+b.svg+'</g>'},0,0]);
    width=Math.max(width,b.w);
    pos+=k*(p[3]-overlap)*unit; i+=k;
  }
  return mathCompose(items,horizontal?length:width,{italic:(a.italic || 0)*unit,
    ...(horizontal?{accent:length/2,stretchAxis:'horizontal'}:{h:length,d:0,extended:true})});
}

function mathDelimiter(value, target, c) {
  if(!value || value==='.')return mathBox();
  const b=mathStretch(value,target,c), axis=mathConstant('AxisHeight',c,0.25);
  // TeXbook rule 19 centres a delimiter's box on the axis; a corner's box keeps it at its corner.
  const centre=b.extended || b.glyph===undefined?(b.inkTop+b.inkBottom)/2:(b.d-b.h)/2;
  return mathCompose([[b,0,-centre-axis]],b.w,{class:'inner',extended:true,italic:b.italic});
}

// The TeXbook's inter-atom spacing table (chapter 18). Rows: the left atom; columns: the right atom, in
// MATH_ATOM_CLASSES order. 0 = none, 1 = thin, a = thin, b = medium, c = thick. A letter spaces only in
// display and text styles; a digit spaces in every style. * cannot occur: a Bin beside these becomes Ord.
const MATH_ATOM_CLASSES = ['ord','op','bin','rel','open','close','punct','inner'];
const MATH_ATOM_SPACING = {
  ord: '01bc000a', op: '11*c000a', bin: 'bb**b**b', rel: 'cc*0c00c',
  open: '00000000', close: '01bc000a', punct: 'aa*aaaaa', inner: 'a1bca0aa'
};
function mathSpace(left, right, c) {
  const column=MATH_ATOM_CLASSES.indexOf(right);
  if (!left || !right || !MATH_ATOM_SPACING[left] || column<0) return 0;
  const code=MATH_ATOM_SPACING[left][column], s=mathScale(c);
  if (code==='0' || code==='*') return 0;
  if (code==='1') return s*3/18;
  if (c.level) return 0;
  return s*({a:3,b:4,c:5})[code]/18;
}

// A character noad: a plain symbol, with or without scripts; TeX reduces a group of one ordinary symbol to that symbol.
function mathCharacterNode(n) {
  if (n?.type==='scripts') return mathCharacterNode(n.base);
  if (n?.type==='row' && n.group && n.children.length===1 && (n.children[0].class || 'ord')==='ord') return mathCharacterNode(n.children[0]);
  // A colour or font declaration styles the symbol itself. unicode-math maps \mathbb, \mathcal, \mathfrak and \mathbfit
  // to characters; \mathrm, \mathit, \mathbf, \mathsf, \mathtt and \textcolor make a group.
  if (n?.type==='style' && !n.declaration && Object.keys(n).every(key=>['type','body','color','variant'].includes(key))) {
    if (n.body?.type!=='row') return mathCharacterNode(n.body);
    if (!n.color && n.variant && !['roman','italic','bold','sans-serif','monospace'].includes(n.variant)) return mathCharacterNode(n.body.children[0]);
  }
  return n?.type==='glyph' && !n.delimiterSize;
}

function mathRow(children,c) {
  // A chosen math list is spliced into its surroundings. Its math-style nodes govern later atoms too.
  const entries=[];let current=c;
  const append=nodes=>{for(const n of nodes) {
    if(n.type==='choice') {append(mathChoice(n,current).children);continue;}
    const declaration=n.type==='style' && n.declaration && n.mathStyle;
    if(declaration)current={...current,level:({display:0,text:0,script:1,scriptscript:2})[n.mathStyle],display:n.mathStyle==='display',cramped:false};
    entries.push({n,context:current,declaration});
  }};
  append(children);children=entries.map(entry=>entry.n);
  const boxes=entries.map(({n,context,declaration})=>{
    const box=declaration?mathBox(0,0,0,'',{space:true}):mathLayout(n,context);
    if(context.screen)box.refit=ratio=>mathScreenRelayout(n,context,ratio);
    if(n.type==='frac' && n.bar!==false && n.barThickness!==0 && !n.left && !n.right)box.flowWrap=width=>mathFraction(n,context,width);
    if(n.type==='fence' && !n.size)box.flowWrap=width=>mathResponsiveLayout(n,context,width);
    return box;
  });
  const significant=boxes.map((b,i)=>b.space?null:i).filter(i=>i!==null);
  for (let k=0;k<significant.length;k++) {
    const i=significant[k], b=boxes[i];
    if (b.class!=='bin') continue;
    const before=boxes[significant[k-1]]?.middle?'open':boxes[significant[k-1]]?.class, after=boxes[significant[k+1]]?.class;
    if (!before || ['bin','op','rel','open','punct'].includes(before) || !after || ['rel','close','punct'].includes(after)) b.class='ord';
  }
  const items=[];let x=0,previous=null,adjacent=false;
  for (const [i,b] of boxes.entries()) {
    if (!b.space) {
      // Appendix G rule 17 as LuaTeX applies it: a character's italic correction is kept only before another character.
      if(previous?.italic && previous.class!=='op' && adjacent && mathCharacterNode(children[i]))x+=previous.italic;
      x+=mathSpace(previous?.class,b.class,entries[i].context);
    }
    items.push([b,x,0]);x+=b.w;
    if (!b.space) previous=b;
    adjacent=!b.space;
  }
  const last=boxes.at(-1);
  return mathCompose(items,x,{class:boxes.length===1?boxes[0].class:'ord',italic:boxes.length!==1 && last?.class==='op'?0:last?.italic || 0,rowItems:items,
    ...(boxes.length===1 ? {accent:last.accent,limits:last.limits,large:last.large,scriptBase:last.scriptBase,accentInk:last.accentInk} : {})});
}

const mathScriptGap = c => c.screen ? Math.max(.035 * mathScale(c), .9 / (c.screen.fontSize * c.screen.pixelRatio)) : .025 * mathScale(c);
function mathScripts(n,c) {
  const b=mathLayout(n.base,c), up=n.sup?mathLayout(n.sup,mathScriptStyle(c)):null,
    down=n.sub?mathLayout(n.sub,mathScriptStyle(c,true)):null;
  const limits=n.limits || b.limits, stack=limits==='always' || (limits==='display' && c.display && c.level===0);
  if (stack) {
    const w=Math.max(b.w,up?.w || 0,down?.w || 0), items=[[b,(w-b.w)/2,0]], ic=b.italic || 0;
    if (up) {
      const y=-b.h-Math.max(mathConstant('UpperLimitBaselineRiseMin',c,0.6),mathConstant('UpperLimitGapMin',c,0.15)+up.d);
      items.push([up,(w-up.w)/2+ic/2,y]);
    }
    if (down) {
      const y=b.d+Math.max(mathConstant('LowerLimitBaselineDropMin',c,0.6),mathConstant('LowerLimitGapMin',c,0.15)+down.h);
      items.push([down,(w-down.w)/2-ic/2,y]);
    }
    return mathCompose(items,w,{class:b.class});
  }
  const base=b.scriptBase || b,boxed=base.glyph===undefined || base.extended,baseAscent=base.h,baseDescent=base.d,
    upDescent=up?.d || 0,downAscent=down?.h || 0;
  let rise=up?Math.max(mathConstant(c.cramped?'SuperscriptShiftUpCramped':'SuperscriptShiftUp',c,0.36),
    upDescent+mathConstant('SuperscriptBottomMin',c,0.1),boxed?baseAscent-mathConstant('SuperscriptBaselineDropMax',c,0.25):0):0;
  let drop=down?Math.max(mathConstant('SubscriptShiftDown',c,0.2),
    downAscent-mathConstant('SubscriptTopMax',c,0.4),boxed?baseDescent+mathConstant('SubscriptBaselineDropMin',c,0.1):0):0;
  if (up && down) {
    const missing=mathConstant('SubSuperscriptGapMin',c,0.2)-(rise+drop-upDescent-downAscent);
    if(missing>0) {
      const shift=Math.min(missing,Math.max(0,mathConstant('SuperscriptBottomMaxWithSubscript',c,0.35)-(rise-upDescent)));
      rise+=shift;drop+=missing-shift;
    }
  }
  const items=[[b,0,0]]; let w=b.w;
  if (up) {
    // A large operator's italic correction moves its subscript left, not its superscript right.
    const nominal=b.w+(b.large?0:b.italic || 0);
    let x=nominal;
    // A superscript beside an over-accent clears the accent's ink as well as the letter's.
    const a=b.accentInk,gap=mathScriptGap(c);
    if(a && up.inkTop-rise<a.bottom+gap && up.inkBottom-rise+gap>a.top)x=Math.max(x,a.right+gap-up.left);
    items.push([up,x,-rise]);w=Math.max(w,x+up.w);
  }
  if (down) {
    const nominal=b.w-(b.large?b.italic || 0:0);
    items.push([down,nominal,drop]);w=Math.max(w,nominal+down.w);
  }
  // \prescript's scripts end together at its base.
  if (n.pre) for (const item of items.slice(1)) item[1]=w-item[0].w;
  // A subscript tucked under a slanted letter leaves the letter's top overhang for the next atom to clear.
  const advance=w+mathConstant('SpaceAfterScript',c,0.05);
  return mathCompose(items,advance,{class:b.class,italic:n.pre || b.large?0:Math.max(0,b.w+(b.italic || 0)-advance)});
}

function mathFraction(n,c,width) {
  if (n.style) c={...c,level:({display:0,text:0,script:1,scriptscript:2})[n.style],display:n.style==='display',cramped:false};
  const display=c.display && c.level===0, child=display?{...c,display:false}:mathScriptStyle(c);
  let top=width===undefined?mathLayout(n.num,child):mathResponsiveLayout(n.num,child,Math.max(.05,width-.2*mathScale(c)));
  // amsmath's \cfrac opens its numerator with LaTeX's \strut: 0.7 and 0.3 of a 1.2 em baseline skip.
  if(n.strut)top={...top,h:Math.max(top.h,.84*mathScale(child)),d:Math.max(top.d,.36*mathScale(child))};
  const bottom=mathLayout(n.den,{...child,cramped:true}),axis=mathConstant('AxisHeight',c,0.25);
  const line=n.bar===false?0:n.barThickness===undefined?mathConstant('FractionRuleThickness',c,0.04):n.barThickness*c.size;
  let rise=mathConstant(line?(display?'FractionNumeratorDisplayStyleShiftUp':'FractionNumeratorShiftUp'):(display?'StackTopDisplayStyleShiftUp':'StackTopShiftUp'),c,display?0.68:0.4),
    drop=mathConstant(line?(display?'FractionDenominatorDisplayStyleShiftDown':'FractionDenominatorShiftDown'):(display?'StackBottomDisplayStyleShiftDown':'StackBottomShiftDown'),c,display?0.68:0.35);
  if (line) {
    const gap=name=>n.barThickness===undefined?mathConstant(name,c,display?0.12:0.06):line*(display?3:1);
    rise=Math.max(rise,top.d+axis+line/2+gap(display?'FractionNumDisplayStyleGapMin':'FractionNumeratorGapMin'));
    drop=Math.max(drop,bottom.h-axis+line/2+gap(display?'FractionDenomDisplayStyleGapMin':'FractionDenominatorGapMin'));
  } else {
    const min=mathConstant(display?'StackDisplayStyleGapMin':'StackGapMin',c,display?0.4:0.15),gap=rise+drop-top.d-bottom.h;
    if (gap<min) {rise+=(min-gap)/2;drop+=(min-gap)/2;}
  }
  // TeX's \nulldelimiterspace (1.2 pt, unscaled in scripts) flanks only an unfenced fraction, outside its rule;
  // a fence's own glyphs bound \binom, and amsmath's \cfrac kerns its right one away.
  const pad=n.left || n.right?0:c.size*0.12,inner=Math.max(top.w,bottom.w),w=inner+pad+(n.strut?0:pad);
  const numeratorX=pad+(n.align==='l'?0:n.align==='r'?inner-top.w:(inner-top.w)/2);
  const items=[[top,numeratorX,-rise],[bottom,pad+(inner-bottom.w)/2,drop]];
  if (line) items.push([mathRule(inner,line,-axis-line/2),pad,0]);
  // LaTeX's \frac, \binom and \genfrac brace their fraction: an ordinary atom, not TeX's bare inner.
  const b=mathCompose(items,w,{class:'ord',innerLines:top.lines || 1,fitted:!!top.fitted});
  if(width!==undefined && c.screen)b.refit=ratio=>mathFraction(n,{...c,screen:{...c.screen,fontSize:c.screen.fontSize*ratio},cache:new WeakMap()},width);
  // Generalized fractions use the fixed \Umathfractiondelsize, independent of the numerator and denominator.
  if (n.left || n.right) {
    const delimiters=n.textDelimiters?{...c,level:0}:c,target=(display?2.4:1.01)*mathScale(c)/mathScale(delimiters);
    return {...mathFenceBoxes(n.left || '',n.right || '',b,delimiters,target),class:'ord'};
  }
  return b;
}

function mathRoot(n,c) {
  const body=mathLayout(n.body,{...c,cramped:true}),line=mathConstant('RadicalRuleThickness',c,0.04),extra=mathConstant('RadicalExtraAscender',c,0.05);
  let gap=mathConstant(c.display && !c.level?'RadicalDisplayStyleVerticalGap':'RadicalVerticalGap',c,0.1);
  const sign=mathStretch('√',body.h+body.d+gap+line,c);
  // TeXbook Appendix G rule 11: a sign taller than needed splits its excess evenly above and below the radicand.
  gap+=Math.max(0,sign.inkBottom-sign.inkTop-(body.h+body.d+gap+line))/2;
  const rise=-sign.inkTop-body.h-gap-line,
    index=n.index?mathLayout(n.index,{...c,level:2,display:false,cramped:false}):null;
  let before=0,idxX=0;
  if(index) {idxX=Math.max(0,mathConstant('RadicalKernBeforeDegree',c,0.2));before=Math.max(0,idxX+index.w+mathConstant('RadicalKernAfterDegree',c,-0.3));}
  const bodyX=before+sign.w,w=bodyX+body.w,items=[[sign,before,rise],[body,bodyX,0]];
  items.push([mathRule(body.w,line,-body.h-gap-line),bodyX,0]);
  const b=mathCompose(items,w);b.h+=extra;
  if(!index)return b;
  const ratio=(MATH_FONT.constants.RadicalDegreeBottomRaisePercent ?? 60)/100;
  return mathCompose([[b,0,0],[index,idxX,sign.inkBottom+rise-(sign.inkBottom-sign.inkTop)*ratio]],w);
}

function mathFenceBoxes(left,right,body,c,size,least=0,measure=body) {
  const axis=mathConstant('AxisHeight',c,0.25),reach=Math.max(measure.h-axis,measure.d+axis),target=size?size*mathScale(c):Math.max(least*mathScale(c),2*reach*0.901,2*reach-0.5*mathScale(c));
  // An empty side is TeX's null delimiter: \nulldelimiterspace wide.
  const side=value=>!value || value==='.'?mathBox(c.size*0.12):mathDelimiter(value,target,c),a=side(left),b=side(right);
  return mathCompose([[a,0,0],[body,a.w,0],[b,a.w+body.w,0]],a.w+body.w+b.w,{class:'inner'});
}

// MathML's menclose notations, drawn with the rule thickness \boxed uses around a 0.2 em padding.
function mathEnclose(n,c) {
  const set=new Set(n.notation),s=mathScale(c),line=mathConstant('FractionRuleThickness',c,0.04),pad=0.2*s,
    b=set.has('radical')?mathLayout({type:'root',body:n.body},c):mathLayout(n.body,c),
    has=(...names)=>names.some(name=>set.has(name)),round=has('circle'),
    left=has('box','roundedbox','circle','left','longdiv','phasorangle'),right=has('box','roundedbox','circle','right','actuarial','madruwb'),
    top=has('box','roundedbox','circle','top','longdiv','actuarial'),bottom=has('box','roundedbox','circle','bottom','madruwb','phasorangle'),
    // A circle is the ellipse through the padded box's corners; longdiv's bracket and phasorangle's slope need room at the left.
    grow=round?(Math.SQRT2-1)/2:0,padL=(left?pad:0)+(has('longdiv')?0.3*s:has('phasorangle')?0.4*s:0)+grow*(b.w+2*pad),padR=(right?pad:0)+grow*(b.w+2*pad),
    padT=(top?pad:0)+grow*(b.h+b.d+2*pad),padB=(bottom?pad:0)+grow*(b.h+b.d+2*pad),
    w=padL+b.w+padR,y0=-b.h-padT,y1=b.d+padB,x0=has('longdiv','phasorangle')?padL-pad:0,m=mathNumber,paths=[];
  const segment=(xa,ya,xb,yb)=>paths.push('M'+m(xa)+' '+m(ya)+'L'+m(xb)+' '+m(yb));
  if(has('box'))paths.push('M0 '+m(y0)+'H'+m(w)+'V'+m(y1)+'H0Z');
  else if(has('roundedbox')) {const r=Math.min(0.25*s,(y1-y0)/2,w/2);paths.push('M'+m(r)+' '+m(y0)+'H'+m(w-r)+'A'+m(r)+' '+m(r)+' 0 0 1 '+m(w)+' '+m(y0+r)+'V'+m(y1-r)+'A'+m(r)+' '+m(r)+' 0 0 1 '+m(w-r)+' '+m(y1)+'H'+m(r)+'A'+m(r)+' '+m(r)+' 0 0 1 0 '+m(y1-r)+'V'+m(y0+r)+'A'+m(r)+' '+m(r)+' 0 0 1 '+m(r)+' '+m(y0)+'Z');}
  else if(round) {const rx=w/2,ry=(y1-y0)/2;paths.push('M0 '+m(y0+ry)+'A'+m(rx)+' '+m(ry)+' 0 1 0 '+m(w)+' '+m(y0+ry)+'A'+m(rx)+' '+m(ry)+' 0 1 0 0 '+m(y0+ry)+'Z');}
  else {
    if(set.has('left'))segment(0,y0,0,y1);
    if(has('right','actuarial','madruwb'))segment(w,y0,w,y1);
    if(has('top','longdiv','actuarial'))segment(x0,y0,w,y0);
    if(has('bottom','madruwb','phasorangle'))segment(has('phasorangle')?0:0,y1,w,y1);
  }
  if(set.has('longdiv'))paths.push('M'+m(x0)+' '+m(y0)+'Q'+m(x0+0.3*s)+' '+m((y0+y1)/2)+' '+m(x0-0.05*s)+' '+m(y1));
  if(set.has('phasorangle'))segment(0,y1,x0+0.1*s,y0);
  if(set.has('horizontalstrike'))segment(0,-mathConstant('AxisHeight',c,0.25),w,-mathConstant('AxisHeight',c,0.25));
  if(set.has('verticalstrike'))segment(w/2,y0,w/2,y1);
  if(set.has('updiagonalstrike'))segment(0,y1,w,y0);
  if(set.has('downdiagonalstrike'))segment(0,y0,w,y1);
  if(set.has('updiagonalarrow')) {const tip=0.2*s;segment(0,y1,w,y0);paths.push('M'+m(w-tip)+' '+m(y0)+'H'+m(w)+'V'+m(y0+tip));}
  const fill=n.background?'<path d="M0 '+m(y0)+'H'+m(w)+'V'+m(y1)+'H0Z" fill="'+mathEscape(n.background)+'" fill-opacity="1"/>':'',
    stroke='<path d="'+paths.join('')+'" fill="none" stroke="currentColor" stroke-opacity="1" stroke-width="'+m(line)+'"/>';
  const box=mathCompose([[b,padL,0]],w,{h:-y0,d:y1,class:b.class});
  box.svg=fill+stroke+box.svg;
  if(n.color)box.svg='<g fill="'+mathEscape(n.color)+'" color="'+mathEscape(n.color)+'" fill-opacity="1" stroke-opacity="1">'+box.svg+'</g>';
  return box;
}

function mathAccent(n,c) {
  const position=n.position || 'over';let nucleus=n.base;
  while(nucleus?.type==='style' || (nucleus?.type==='row' && nucleus.children.length===1))nucleus=nucleus.type==='style'?nucleus.body:nucleus.children[0];
  const b=mathLayout(n.base,position==='under'?c:{...c,cramped:true,dotless:nucleus?.type==='glyph' && !n.overlay && /^[\u0300-\u036f\u20d0-\u20ff]$/u.test(n.value)}),s=mathScale(c);
  // A brace is an operator: centred on its base, with no italic correction to shift its labels.
  // TeX's rules 12 and 18a: scripts on an accented character sit by the character; a bar, or an accent over more than one character, is a box.
  const brace=n.limits==='always',bar=/^(overline|underline|¯|_)$/.test(n.value) && !n.overlay,character=!bar && nucleus?.type==='glyph',
    semantics={class:n.class || (brace?'op':b.class),limits:n.limits || b.limits,italic:brace || !(character || n.overlay)?0:b.italic,accent:b.accent,scriptBase:character || n.overlay?b.scriptBase || b:undefined};
  if(n.overlay) {
    const w=Math.max(b.w,0.2*s),line=mathConstant('FractionRuleThickness',c,0.04);
    const rising='M0 '+mathNumber(b.d)+'L'+mathNumber(w)+' '+mathNumber(-b.h),
      falling='M0 '+mathNumber(-b.h)+'L'+mathNumber(w)+' '+mathNumber(b.d);
    let path=n.value==='╲'?falling:n.value==='╳'?rising+falling:n.value==='─'?'M0 '+mathNumber(-mathConstant('AxisHeight',c,0.25))+'H'+mathNumber(w):rising;
    if(n.value==='↗') {
      const tip=0.2*s;path+='M'+mathNumber(w-tip)+' '+mathNumber(-b.h)+'H'+mathNumber(w)+'v'+mathNumber(tip);
    }
    return {...b,...semantics,svg:b.svg+'<path d="'+path+'" fill="none" stroke="currentColor" stroke-width="'+mathNumber(line)+'"/>'};
  }
  if (n.value==='overline' || n.value==='underline' || n.value==='¯' || n.value==='_') {
    const over=position!=='under',line=mathConstant(over?'OverbarRuleThickness':'UnderbarRuleThickness',c,0.04),gap=mathConstant(over?'OverbarVerticalGap':'UnderbarVerticalGap',c,0.1);
    // amsmath's \varliminf underlines lim over a strut 0.2 ex@ deep.
    if(n.varlim && !over)b.d=Math.max(b.d,0.02*s);
    const y=over?-b.h-gap-line:b.d+gap;
    const result=mathCompose([[b,0,0],[mathRule(b.w,line,y),0,0]],b.w,semantics);
    result[over?'h':'d']+=mathConstant(over?'OverbarExtraAscender':'UnderbarExtraDescender',c,0.04);
    return result;
  }
  // The font's accent attachment aligns both top and bottom accents; a through stroke stays centered.
  // TeX's stretchy arrows and harpoons over or under a formula are the font's combining arrows, set as accents.
  const arrows=n.stretch && n.class!=='op' && (position==='over'?{'→':'⃗','←':'⃖','↔':'⃡','↼':'⃐','⇀':'⃑'}:position==='under'?{'→':'⃯','←':'⃮','↔':'͍'}:{}),
    value=arrows?.[n.value] && MATH_FONT.chars[arrows[n.value].codePointAt(0)]!==undefined?arrows[n.value]:n.value,
    a=n.stretch?mathStretch(value,Math.max(b.w,s*0.3),c,true,n.class!=='op'):mathGlyph(value,c,{variant:'roman'}),
    x=position==='through' || brace?(b.w-a.w)/2:(b.accent ?? b.w/2)-(a.accent ?? a.w/2),combining=/^[\u0300-\u036f\u20d0-\u20ff]$/u.test(value);
  let y;
  if(position==='through')y=0;
  // A glyph the font draws below the baseline hangs from the base's depth, as LuaTeX sets a bottom accent.
  else if(position==='under')y=a.inkTop>=0?b.d:b.d+mathConstant('UnderbarVerticalGap',c,0.1)-a.inkTop;
  // A glyph drawn above the x-height keeps its designed height, raised by the base's height above AccentBaseHeight.
  else if(combining || a.inkBottom<0)y=-Math.max(0,b.h-mathConstant('AccentBaseHeight',c,0.48));
  else y=-b.h-mathConstant('OverbarVerticalGap',c,0.1)-a.inkBottom;
  // amsmath's \varinjlim and \varprojlim stack lim, a 1.5 ex@ kern, the arrow and a kern of -1 ex@ (ex@ is 1 pt).
  if(n.varlim && position==='under')return mathCompose([[b,0,0],[a,x,b.d+0.15*s+a.h]],b.w,{...semantics,d:b.d+0.15*s+a.h+a.d-0.1*s});
  // A combining under-accent's box is its ink: its advance box rests far below the mark.
  if(position==='under')return mathCompose([[b,0,0],[{...a,h:-a.inkTop,d:a.inkBottom},x,y]],b.w,semantics);
  if(position==='over') {
    const g=a.glyph===undefined?null:MATH_FONT.glyph(a.glyph),left=g?(a.glyphX || 0)+g[1]*a.unitScale:a.left,right=g?(a.glyphX || 0)+g[3]*a.unitScale:a.right;
    semantics.accentInk={left:x+left,right:x+right,top:y+a.inkTop,bottom:y+a.inkBottom};
  }
  return mathCompose([[b,0,0],[a,x,y]],b.w,semantics);
}

function mathTable(n,c) {
  const small=/smallmatrix$/.test(n.env) || n.env==='subarray' || n.env==='substack',
    paired=/^(align(?:ed)?(?:at)?|flalign|split)$/.test(n.env),
    display=paired || /^([lr]?gather(?:ed)?|eqnarray|multline(?:d)?|equation|drcases|dcases|darray)$/.test(n.env),
    cellStyle={...c,level:small?Math.max(1,c.level):c.level,display:small?false:display,cramped:false};
  const rows=n.rows.map(row=>row.map((cell,i)=>{
    // The second cell in each equation pair continues the first math list.
    // An empty ordinary atom supplies the left neighbour of a leading relation.
    if(paired && i%2) return mathRow([{type:'row',children:[]},...(cell.type==='row'?cell.children:[cell])],cellStyle);
    return mathLayout(cell,cellStyle);
  }));
  // A cell spanning columns (\multicolumn, \hdotsfor) and an \intertext line do not set their columns' widths.
  const own=(r,i)=>{const cell=n.rows[r][i];return !(cell?.span>1 || cell?.covered || cell?.intertext);};
  const cols=Math.max(n.align?.length || 0,n.pairs?2*n.pairs:0,...rows.map((r,k)=>n.rows[k][0]?.intertext?0:r.length)),s=mathScale(c),cs=mathScale(cellStyle),
    widths=Array.from({length:cols},(_,i)=>Math.max(0,...rows.map((row,r)=>own(r,i)?row[i]?.w || 0:0))),
    align=n.env==='eqnarray'?Array.from({length:cols},(_,i)=>['r','c','l'][i%3]):n.align || Array(cols).fill('c');
  if(rows.length*(cols+(n.columnInsertions?.length || 0))+(n.columnRules?.length || 0)+(n.rowRules?.length || 0)>100000)
    throw Object.assign(new Error('Array composition exceeds the rendering budget'),{code:'resource-limit'});
  const insertions=Array.from({length:cols+1},()=>[]);
  for(const insertion of n.columnInsertions || []) {
    if(insertion.before<0 || insertion.before>cols) throw Object.assign(new Error('Array insertion exceeds its columns'),{code:'invalid-alignment'});
    insertions[insertion.before].push({...insertion,box:mathLayout(insertion.body,cellStyle)});
  }
  // LaTeX's array keeps half its column gap (\arraycolsep) outside the edge columns. Rules take no width;
  // each further rule in a run adds \doublerulesep.
  // amsmath's smallmatrix has a thin space at each side and a thick space between its columns.
  const ruleRuns=Array(cols+1).fill(0),edge=/^d?array$/.test(n.env)?s/2:/smallmatrix$/.test(n.env)?s/6:0;
  for(const boundary of n.columnRules || [])if(boundary>=0 && boundary<=cols)ruleRuns[boundary]++;
  const ruleSep=0.2*s,ruleStarts=[];
  const gaps=Array.from({length:cols+1},(_,i)=>{
    let gap=i===0 || i===cols?edge:paired?(i%2?0:/^(alignat|alignedat)$/.test(n.env)?0:2*s):/smallmatrix$/.test(n.env)?5/18*s:small?cs/3:n.env==='CD'?0:s;
    if(insertions[i].some(item=>item.replaceGap))gap=0;
    const content=gap+insertions[i].reduce((sum,item)=>sum+item.box.w,0);
    ruleStarts.push(i===0?0:i===cols?content:content/2);
    return content+Math.max(0,ruleRuns[i]-1)*ruleSep;
  });
  // A spanning cell wider than its columns widens the last of them, as TeX's \multispan does.
  for(const [r,row] of n.rows.entries())for(const [i,cell] of row.entries())if(cell?.span>1 && !cell.dots) {
    const last=Math.min(cols,i+cell.span)-1,room=widths.slice(i,last+1).reduce((a,b)=>a+b,0)+gaps.slice(i+1,last+1).reduce((a,b)=>a+b,0);
    if(rows[r][i].w>room)widths[last]+=rows[r][i].w-room;
  }
  const starts=[],ends=[],boundaries=[],insertionItems=[];let w=0;
  for(let i=0;i<=cols;i++) {
    const contentWidth=insertions[i].reduce((sum,item)=>sum+item.box.w,0);
    boundaries.push(w+ruleStarts[i]);
    let x=w+(gaps[i]-contentWidth)/2;
    for(const item of insertions[i]) {insertionItems.push([item.box,x]);x+=item.box.w;}
    w+=gaps[i];if(i<cols) {starts.push(w);w+=widths[i];ends.push(w);}
  }
  const insertionHeight=Math.max(0,...insertionItems.map(([b])=>b.h)),insertionDepth=Math.max(0,...insertionItems.map(([b])=>b.d)),
    // LaTeX's array strut is 0.7 and 0.3 of a 1.2 em baseline skip (cases stretches it by 1.2); rows abut,
    // and only the display alignments add \jot between them.
    strut=small || n.env==='CD'?[0.7,0.2]:/cases$/.test(n.env)?[1.008,0.432]:[0.84,0.36],
    rowGap=small?0.2:n.env==='CD'?0.3:/^(align|flalign|split|[lr]?gather|eqnarray|multline)/.test(n.env)?0.3:0,
    heights=rows.map(row=>Math.max(strut[0]*cs,insertionHeight,...row.map(b=>b.h))),
    depths=rows.map(row=>Math.max(strut[1]*cs,insertionDepth,...row.map(b=>b.d))),baselines=[];
  // A full-width rule between rows takes \arrayrulewidth of height; a run of them steps by \doublerulesep.
  const line=mathConstant('FractionRuleThickness',c,0.04),hlines=Array(rows.length+1).fill(0),hlineStarts=[];
  for(const rule of n.rowRules || [])if(rule.from===undefined && rule.to===undefined && rule.before>=0 && rule.before<=rows.length)hlines[rule.before]++;
  const hlineSpace=k=>k?line+(k-1)*ruleSep:0;
  let total=0;
  // amsmath's subarray has no strut: its rows are a baseline skip apart (the script font's stack shifts), or a
  // lineskip of three rules apart where they would come closer.
  // smallmatrix's rows are 6 ex@ apart with a lineskip of 1.5 ex@ (ex@ is 1 pt).
  const skip=n.env==='subarray' || n.env==='substack'?{base:(mathConstant('StackTopShiftUp',c,0.444)+mathConstant('StackBottomShiftDown',c,0.345))*cs/s,line:3*mathConstant('FractionRuleThickness',cellStyle,0.04)}:
    /smallmatrix$/.test(n.env)?{base:0.6*s,line:0.15*s}:n.env==='CD'?{base:2*cs,line:0.3*cs}:null;
  if(skip)for(const [r,row] of rows.entries()) {heights[r]=Math.max(0,...row.map(b=>b.h));depths[r]=Math.max(0,...row.map(b=>b.d));}
  for(let r=0;r<=rows.length;r++) {
    hlineStarts.push(total);total+=hlineSpace(hlines[r]);
    if(r===rows.length)break;
    total+=heights[r];baselines.push(total);total+=depths[r];
    if(r+1<rows.length)total+=skip?Math.max(skip.base-depths[r]-heights[r+1],skip.line):rowGap*cs+(n.rowGaps?.[r] || 0)*s;
  }
  const offset=n.position==='t'?-(baselines[0] || 0):n.position==='b'?-(baselines.at(-1) || 0):-total/2-mathConstant('AxisHeight',c,0.25),items=[];
  for(let r=0;r<rows.length;r++) {
    if(n.rows[r][0]?.intertext) {items.push([rows[r][0],0,baselines[r]+offset]);continue;}
    for(let i=0;i<cols;i++) {
      const cell=n.rows[r][i];
      if(cell?.covered)continue;
      const last=cell?.span>1?Math.min(cols,i+cell.span)-1:i,width=(ends[last] ?? starts[i])-starts[i];
      // amsmath's \hdotsfor: dots 3 mu apart times its spacing, spread evenly across the columns it fills.
      if(cell?.dots) {
        const dot=mathGlyph('.',cellStyle,{variant:'roman'}),step=dot.w+cell.dots*3/18*cs,count=Math.max(1,Math.floor(width/step)),spread=width/count;
        for(let k=0;k<count;k++)items.push([dot,starts[i]+k*spread+(spread-dot.w)/2,baselines[r]+offset]);
        continue;
      }
      const b=rows[r][i] || mathBox(),a=cell?.spanAlign || (/^multlined?$/.test(n.env) && cols===1?(r===0?'l':r===rows.length-1?'r':'c'):align[i] || 'c'),
        dx=a==='r'?width-b.w:a==='l'?0:(width-b.w)/2;
      items.push([b,starts[i]+dx,baselines[r]+offset]);
    }
    for(const [b,x] of insertionItems)items.push([b,x,baselines[r]+offset]);
  }
  const ruleCounts=new Map(),band=r=>[hlineStarts[r]+hlineSpace(hlines[r]),hlineStarts[r+1]+hlineSpace(hlines[r+1])];
  const vertical=(x,from,to,dashed)=>items.push([mathBox(line/2,0,to-from,'<path data-math-line="vertical" d="M0 0v'+mathNumber(to-from)+'" fill="none" stroke="currentColor" stroke-width="'+mathNumber(line)+'"'+(dashed?' stroke-dasharray="'+mathNumber(.15*s)+' '+mathNumber(.1*s)+'"':'')+'/>',{left:-line/2}),x,offset+from]);
  // A \multicolumn replaces the rules of the columns it spans (the first column's left rule too) with its own.
  const spans=n.rows.flatMap((row,r)=>row.flatMap((cell,i)=>cell?.span>1 || cell?.spanRules?[{r,i,last:Math.min(cols,i+(cell.span || 1))-1,rules:cell.spanRules || []}]:[]));
  for(const [index,boundary] of (n.columnRules || []).entries()) {
    if(boundary<0 || boundary>cols)throw Object.assign(new Error('Array rule exceeds its columns'),{code:'invalid-rule'});
    const count=ruleCounts.get(boundary) || 0;ruleCounts.set(boundary,count+1);
    const x=boundaries[boundary]+count*ruleSep,gaps=spans.filter(span=>span.i<boundary && boundary<=span.last+1 || span.i===0 && boundary===0).map(span=>band(span.r)).sort((a,b)=>a[0]-b[0]);
    let y=0;
    for(const [top,bottom] of gaps) {if(top>y)vertical(x,y,top,n.columnDashes?.[index]);y=Math.max(y,bottom);}
    if(y<total)vertical(x,y,total,n.columnDashes?.[index]);
  }
  for(const span of spans)for(const rule of span.rules)vertical(rule===0?boundaries[span.i]:boundaries[span.last+1],...band(span.r));
  ruleCounts.clear();
  for(const rule of n.rowRules || []) {
    const boundary=rule.before,from=rule.from ?? 0,to=rule.to ?? cols;
    if(boundary<0 || boundary>rows.length || from<0 || to>cols)throw Object.assign(new Error('Array rule exceeds its cells'),{code:'invalid-rule'});
    const count=ruleCounts.get(boundary) || 0;ruleCounts.set(boundary,count+1);
    const full=rule.from===undefined && rule.to===undefined,
      y=(full?hlineStarts[boundary]+line/2+count*ruleSep:boundary===0?0:boundary===rows.length?total:(baselines[boundary-1]+depths[boundary-1]+baselines[boundary]-heights[boundary])/2+count*0.15*s)+offset,
      left=from===0?0:boundaries[from],right=to===cols?w:boundaries[to];
    const stroke='<path data-math-line="horizontal" d="M0 0H'+mathNumber(right-left)+'" fill="none" stroke="currentColor" stroke-width="'+mathNumber(line)+'"'+(rule.dashed?' stroke-dasharray="'+mathNumber(.15*s)+' '+mathNumber(.1*s)+'"':'')+'/>';
    items.push([mathBox(right-left,line/2,line/2,stroke),left,y]);
  }
  // An array is a \vcenter, an ordinary atom; a fenced one is an inner atom, as \left and \right make it.
  const b=mathCompose(items,Math.max(w,...rows.map((row,r)=>n.rows[r][0]?.intertext?row[0].w:0)),{class:'ord',h:Math.max(0,-offset),d:Math.max(0,total+offset)});
  const pair=mathTableDelimiters(n.env);
  return pair?mathFenceBoxes(pair[0],pair[1],b,c):b;
}

function mathLayout(n,c) {
  c.displayMode ??= c.display;
  if(!n)return mathBox();
  // With spans, each symbol carries its source offset for the host's tap-to-place.
  if(c.spans && n.at!==undefined && (n.type==='glyph' || n.type==='text')) {
    const b=mathLayout({...n,at:undefined},c);
    return {...b,svg:'<g data-math-at="'+n.at+'">'+b.svg+'</g>'};
  }
  // An empty argument shows the placeholder box a missing one does, as a place to tap.
  if(c.spans && n.at!==undefined && n.type==='row' && !n.children.length)
    return mathLayout({type:'glyph',value:'□',variant:'roman',at:n.at},c);
  if(c.budget && ++c.budget.nodes>100000)throw Object.assign(new Error('Mathematical layout exceeds the rendering budget'),{code:'resource-limit'});
  switch(n.type) {
    case 'row': {
      const b=mathRow(n.children,c);
      if(n.group) {
        Object.assign(b,{class:'ord',limits:undefined});
        // TeX collapses a single character before resolving choices; every other group stays a boxed nucleus.
        if(!mathCharacterNode(n))Object.assign(b,{glyph:undefined,scriptBase:undefined,italic:0});
      }
      return b;
    }
    case 'glyph': {
      // TeX spaces a \middle as a closing atom, and a binary atom after it becomes ordinary.
      const middle=n.delimiter && !n.delimiterSize?{class:'close',middle:true}:{};
      // amsmath's \big to \Bigg are \left and \right around a strut 1.2 to 3 times a parenthesis's height and depth,
      // so TeX's \delimiterfactor and \delimitershortfall choose the size, and the strut sets the box.
      if(n.delimiterSize) {
        const paren=MATH_FONT.glyph(MATH_FONT.chars[40]),s=mathScale(c),strut=n.delimiterSize*(paren[4]-paren[2])/MATH_FONT.units*s,axis=mathConstant('AxisHeight',c,0.25);
        const b=mathDelimiter(n.value,Math.max(strut*0.901,strut-0.5*s),c);
        return {...b,h:Math.max(b.h,axis+strut/2),d:Math.max(b.d,strut/2-axis),class:n.class || 'ord',...middle};
      }
      if(n.delimiter && c.delimiterTarget)return {...mathDelimiter(n.value,c.delimiterTarget,c),class:n.class || 'ord',...middle};
      if(n.stretch)return {...mathStretch(n.value,c.stretchTarget || mathScale(c),c,true,false,!!c.stretchTarget),class:n.class || 'rel',limits:n.limits,stretchAxis:'horizontal'};
      let b=mathGlyph(n.value,c,{class:n.class || 'ord',...middle,variant:n.variant || (c.variant==='normal'?n.defaultVariant || 'normal':c.variant),large:n.large,limits:n.limits});
      if(n.large) {
        let a=c.display && !c.level?mathStretch(n.value,mathConstant('DisplayOperatorMinHeight',c,1.3),c):b;
        // LuaTeX's vertical glyph boxes use CFF control bounds; the ink keeps its exact extrema.
        const bounds=MATH_FONT.verticalBounds[a.glyph];
        if(bounds)a={...a,h:Math.max(0,bounds[1]*a.unitScale),d:Math.max(0,-bounds[0]*a.unitScale)};
        b=mathCompose([[a,0,(a.h-a.d)/2-mathConstant('AxisHeight',c,0.25)]],a.w,{class:n.class || 'op',italic:a.italic,limits:n.limits,large:true,glyph:a.glyph,unitScale:a.unitScale});
      }
      return b;
    }
    case 'text': return mathText(n.value,c,{variant:n.variant || (c.variant==='normal'?'roman':c.variant),class:n.class,limits:n.limits,verbatim:n.verbatim});
    case 'choice': return mathLayout(mathChoice(n,c),c);
    case 'space': return mathBox((c.displayMode && n.displayWidth!==undefined?n.displayWidth:n.width)*mathScale(c),0,0,'',{space:true});
    case 'scripts': return mathScripts(n,c);
    case 'frac': return mathFraction(n,c);
    case 'root': return mathRoot(n,c);
    case 'enclose': return mathEnclose(n,c);
    case 'fence': {
      // A nested fence does not inherit an outer \middle target. Its cached box
      // survives the outer fence's second pass, keeping nested layout linear.
      const cache=c.cache || (c.cache=new WeakMap()),key=[c.size,c.level,c.variant,c.display,c.cramped,c.stretchTarget].join('|');
      let entries=cache.get(n);if(entries?.has(key))return {...entries.get(key)};
      const local={...c,delimiterTarget:undefined};let b=mathLayout(n.body,local);const first=b;
      // Only a \middle needs the second pass, sized to the first pass's body.
      if(n.body && mathHasMiddle(n.body)) {
        const axis=mathConstant('AxisHeight',c,0.25),reach=Math.max(b.h-axis,b.d+axis),target=Math.max(2*reach*0.901,2*reach-0.5*mathScale(c));
        b=mathLayout(n.body,{...local,delimiterTarget:target});
      }
      // LuaTeX sizes \left and \right from the body as \middle is sized, not from the grown \middle.
      b=mathFenceBoxes(n.left,n.right,b,local,n.size,0,first);if(n.class)b.class=n.class;
      if(!entries)cache.set(n,entries=new Map());entries.set(key,b);return {...b};
    }
    case 'accent': return mathAccent(n,c);
    case 'table': return mathTable(n,c);
    case 'style': {
      const style={...c};if(n.variant)style.variant=n.variant;if(n.absoluteSize!==undefined)style.size=n.absoluteSize;if(n.size!==undefined)style.size*=n.size;
      if(n.mathStyle) {style.level=({display:0,text:0,script:1,scriptscript:2})[n.mathStyle];style.display=n.mathStyle==='display';style.cramped=false;}
      const b=mathLayout(n.body,style);if(n.class)b.class=n.class;if(n.limits)b.limits=n.limits;
      if(n.smashOperator) {
        const op=mathLayout(n.body.type==='scripts'?n.body.base:n.body,style),extra=Math.max(0,(b.w-op.w)/2),left=n.smashOperator.includes('l')?extra:0;
        Object.assign(b,mathCompose([[{...b},-left,0]],b.w-left-(n.smashOperator.includes('r')?extra:0),{class:b.class}));
      }
      if(n.width!==undefined) {
        const width=n.width*mathScale(style),shift=n.align==='right'?width-b.w:n.align==='center'?(width-b.w)/2:0;
        Object.assign(b,mathCompose([[{...b},shift,0]],width,{class:b.class}));
      }
      if(n.border || n.background) {
        const pad=(n.padding ?? 0.2)*mathScale(style),line=mathConstant('FractionRuleThickness',style,0.04),w=b.w+2*pad,h=b.h+b.d+2*pad;
        const border='<path d="M0 '+mathNumber(-b.h-pad)+'H'+mathNumber(w)+'v'+mathNumber(h)+'H0Z" fill="'+(n.background?mathEscape(n.background):'none')+'" fill-opacity="1" stroke-opacity="1"'+(n.border?' stroke="'+mathEscape(n.border)+'" stroke-width="'+mathNumber(line)+'"':'')+'/>';
        Object.assign(b,mathCompose([[{...b},pad,0]],w,{h:b.h+pad,d:b.d+pad,class:b.class}));b.svg=border+b.svg;
      }
      if(n.color)b.svg='<g fill="'+mathEscape(n.color)+'" color="'+mathEscape(n.color)+'" fill-opacity="1" stroke-opacity="1">'+b.svg+'</g>';
      return b;
    }
    case 'overunder': {
      const s=mathScale(c),ss=mathScale(mathScriptStyle(c)),kind=n.arrow || '',doubled=/^(Leftarrow|Rightarrow|Leftrightarrow)$/.test(kind),
        paired=/^(rightleftharpoons|leftrightharpoons)$/.test(kind),
        label=(x,cramped)=>x && !(n.base?.stretch && !n.diagram && x.type==='row' && !x.children.length)?mathLayout(x,mathScriptStyle(c,cramped)):null;
      let over=label(n.over),under=label(n.under,true);
      // mathtools puts a text control-space beside each double-arrow label, including an empty one.
      if(doubled) {
        const left=kind!=='Rightarrow'?0.333*s:0,right=kind!=='Leftarrow'?0.333*s:0,
          padded=b=>mathCompose([[b || mathBox(),left,0]],(b?.w || 0)+left+right);
        over=padded(over);under=padded(under);
      }
      // mhchem raises its lower label to a common 1.25 ex top and smashes its height before adding limits.
      if(n.unspaced && under)under={...mathCompose([[under,0,under.h-1.25*MATH_FONT.xHeight/MATH_FONT.units*s]],under.w),h:0};
      const pad=(n.labelPad ?? (doubled?10:14))/18*ss,target=Math.max((n.minWidth || (/^hook/.test(kind)?10/9:1))*s,Math.max(over?.w || 0,under?.w || 0)+pad),
        shift=n.unspaced && n.base.value==='→'?-2/18*ss:/^(leftarrow|rightarrow|leftrightarrow|mapsto|hookleftarrow|hookrightarrow|leftharpoonup|leftharpoondown|rightharpoonup|rightharpoondown)$/.test(kind)?(/^(left|hook)/.test(kind)?1:-1)*1.5/18*ss:0;
      // These arrows, and amsmath's overset/underset/stackrel, are operators with TeX's ordinary limit gaps.
      const stack=(b,above,below,dx=shift)=>{
        const w=Math.max(b.w,above?.w || 0,below?.w || 0),items=[[b,(w-b.w)/2,0]];
        if(above) {
          const rise=n.accentGap?b.h+above.inkBottom+mathConstant('OverbarVerticalGap',c,0.1):b.h+Math.max(mathConstant('UpperLimitBaselineRiseMin',c,0.111),mathConstant('UpperLimitGapMin',c,0.2)+above.d);
          items.push([above,(w-above.w)/2+dx,-rise]);
        }
        if(below) {
          const drop=n.accentGap?b.d-below.inkTop+mathConstant('UnderbarVerticalGap',c,0.1):b.d+Math.max(mathConstant('LowerLimitBaselineDropMin',c,0.6),mathConstant('LowerLimitGapMin',c,0.167)+below.h);
          items.push([below,(w-below.w)/2+dx,drop]);
        }
        return mathCompose(items,w,{class:n.unspaced?'ord':n.class || b.class});
      };
      if(paired) {
        // Each half carries the opposite label as a phantom. Even an empty phantom retains its limit gap.
        const right=kind==='rightleftharpoons',phantom=b=>({...b || mathBox(),svg:''}),dy=0.22*MATH_FONT.xHeight/MATH_FONT.units*s,
          top=stack(mathStretch(right?'⇀':'↼',target,c,true,false,true),over,phantom(under),(right?-1:1)*1.5/18*ss),
          bottom=stack(mathStretch(right?'↽':'⇁',target,c,true,false,true),phantom(over),under,(right?1:-1)*1.5/18*ss);
        return mathCompose([[top,0,-dy],[bottom,top.w-bottom.w,dy]],top.w,{class:'rel'});
      }
      let b;
      if(/^hook/.test(kind)) {
        // The small Latin Modern hook owns five mu; joining it to the shaft removes three mu.
        const right=kind==='hookrightarrow',arrow=mathStretch(right?'→':'←',target-2/18*s,c,true,false,true),hook=mathGlyphIndex(MATH_FONT.arrowHook,c),width=arrow.w+2/18*s;
        if(right)b=mathCompose([[hook,0,0],[arrow,2/18*s,0]],width);
        else {
          const reflected=mathBox(5/18*s,hook.h,hook.d,'<g transform="translate('+mathNumber(5/18*s)+' 0) scale(-1 1)">'+hook.svg+'</g>');
          b=mathCompose([[arrow,0,0],[reflected,arrow.w-3/18*s,0]],width);
        }
      } else b=n.diagram && n.base.value==='='?mathCompose([[mathRule(target,0.04*s,-0.28*s),0,0],[mathRule(target,0.04*s,-0.04*s),0,0]],target):mathLayout(n.base,{...c,stretchTarget:target});
      return stack(b,over,under);
    }
    case 'phantom': {const b=mathLayout(n.body,c);return mathBox(n.mode==='v'?0:b.w,n.mode==='h'?0:b.h,n.mode==='h'?0:b.d);}
    case 'smash': {const b=mathLayout(n.body,c);return {...b,h:n.mode==='b'?b.h:0,d:n.mode==='t'?b.d:0,glyph:undefined,scriptBase:undefined};}
    // \vcenter centres its box on the maths axis.
    case 'raise': {const b=mathLayout(n.body,c),s=mathScale(c);return mathCompose([[b,0,n.center?(b.h-b.d)/2-mathConstant('AxisHeight',c,0.25):-n.amount*s]],b.w,{class:b.class,...(n.height===undefined?{}:{h:n.height*s}),...(n.depth===undefined?{}:{d:n.depth*s})});}
    case 'rule': {const s=mathScale(c);return mathRule(n.width*s,(n.height+n.depth)*s,-n.height*s);}
    case 'link': {const b=mathLayout(n.body,c);const url=new URL(n.href);if(!['http:','https:'].includes(url.protocol))throw Object.assign(new Error('Unsupported equation link'),{code:'unsafe-url'});b.svg='<a href="'+mathEscape(n.href)+'" aria-label="'+mathEscape(n.href)+'" tabindex="0" target="_blank" rel="noopener noreferrer">'+b.svg+'</a>';return b;}
    default: throw Object.assign(new Error('Unsupported math construct: '+n.type),{code:'unsupported-construct'});
  }
}

// SPDX-License-Identifier: MIT
// Compose missing mathematical symbols from this font's own outlines and rules.
function mathFallbackGlyph(value,c,extra={}) {
  if(!'ϝ▴▾◇◆ⓈℲ⅁╱╲⩞⪷⪸⫅⫆⋔◂▸⪵⪶⪹⪺⫋⫌⇠⇢⨋⎰⎱'.includes(value))return null;
  const s=mathScale(c),axis=mathConstant('AxisHeight',c,.25),line=mathConstant('FractionRuleThickness',c,.04),
    draw=(ch,factor=1)=>mathGlyphIndex(MATH_FONT.chars[ch.codePointAt(0)],{...c,size:c.size*factor}),
    centered=b=>mathCompose([[b,0,-axis-(b.inkTop+b.inkBottom)/2]],b.w,extra);
  const contour=(width,low,high,path,factor=1)=>{
    const size=s*factor,unit=size/MATH_FONT.units,stroke=mathScreenStroke({...c,size:c.size*factor}),radius=stroke/2;
    return mathBox(width*unit,high*unit+radius,Math.max(0,-low*unit+radius),
      '<path d="'+path+'" transform="scale('+mathNumber(unit)+' '+mathNumber(-unit)+')"'+
      (c.screen?' data-math-ink="'+mathNumber(size)+'"':'')+
      (stroke?' stroke="currentColor" stroke-width="'+mathNumber(stroke/unit)+'" stroke-linejoin="round" paint-order="stroke fill"':'')+'/>',
      {left:-radius,right:width*unit+radius,inkTop:-high*unit-radius,inkBottom:-low*unit+radius,...extra});
  };
  if(value==='ϝ') {
    const b=draw('𝑓'),g=MATH_FONT.glyph(b.glyph),path=g[7],bars=[...path.matchAll(/H(\d+)/g)],
      start=bars[1],end=bars[2],cut=Number(path.slice(0,start.index).match(/-?\d+/g).at(-1)),
      left=Number(start[1]),right=Number(path.slice(start.index,end.index).match(/-?\d+/g).at(-2)),
      body='M'+left+' '+cut+path.slice(start.index+start[0].length,end.index)+'Z',unit=b.unitScale,
      barEnd=g[0],top=MATH_FONT.xHeight,thickness=top-cut,
      upper=contour(g[0],cut,top,'M'+left+' '+cut+'H'+barEnd+'V'+top+'H'+left+'Z'),
      middle=contour(g[0],170,170+thickness,'M'+(left-50)+' 170H'+(barEnd-45)+'V'+(170+thickness)+'H'+(left-50)+'Z');
    const stem={...b,h:cut*unit+b.stroke/2,inkTop:-cut*unit-b.stroke/2,right:Math.max(b.w,right*unit),
      svg:b.svg.replace('d="'+path+'"','d="'+body+'"'),glyph:undefined};
    return mathCompose([[stem,0,0],[upper,0,0],[middle,0,0]],b.w,{...extra,italic:0});
  }
  if('Ⅎ⅁'.includes(value)) {
    const b=draw(value==='Ⅎ'?'F':String.fromCodePoint(mathStyledCodePoint(71,'sans-serif'))),svg='<g transform="translate('+mathNumber(b.w)+' '+mathNumber(b.inkTop+b.inkBottom)+') scale(-1 -1)">'+b.svg+'</g>';
    return {...b,svg,left:b.w-b.right,right:b.w-b.left,accent:b.w/2,italic:0,glyph:undefined,...extra};
  }
  if(value==='Ⓢ') {
    const circle=draw('○'),letter=draw('S',.62),y=(circle.inkTop+circle.inkBottom-letter.inkTop-letter.inkBottom)/2;
    return mathCompose([[circle,0,0],[letter,(circle.w-letter.w)/2,y]],circle.w,extra);
  }
  if('▴▾◂▸'.includes(value))return centered(draw({'▴':'▲','▾':'▼','◂':'◀','▸':'▶'}[value],.8));
  if(value==='◇') {
    const diamond=draw('⋄'),square=draw('□'),factor=(square.inkBottom-square.inkTop)/(diamond.inkBottom-diamond.inkTop);
    return centered(draw('⋄',factor));
  }
  if(value==='◆') {
    const b=draw('◊'),path=MATH_FONT.glyph(b.glyph)[7],contours=path.match(/M[^M]+/g);
    const range=part=>{const numbers=part.match(/-?\d+(?:\.\d+)?/g).map(Number);return Math.max(...numbers)-Math.min(...numbers);};
    const outer=contours.reduce((a,b)=>range(a)>range(b)?a:b);
    return {...b,svg:b.svg.replace('d="'+path+'"','d="'+outer+'"'),glyph:undefined,...extra};
  }
  if(value==='╱'||value==='╲') {
    const t=MATH_FONT.constants.FractionRuleThickness/Math.SQRT2;
    const points=[[75,-75],[725,575],[725+t,575-t],[75+t,-75-t]];
    if(value==='╲')for(const point of points)point[0]=800-point[0];
    return contour(800,-75-t,575,'M'+points.map(point=>point.map(mathNumber).join(' ')).join('L')+'Z');
  }
  if(value==='⋔') {
    const b=draw('∩',.86),g=MATH_FONT.glyph(b.glyph),x=(g[1]+g[3])/2,t=MATH_FONT.constants.FractionRuleThickness,
      stem=contour(g[0],g[2],g[4]+100,'M'+mathNumber(x-t/2)+' '+g[2]+'V'+(g[4]+100)+'H'+mathNumber(x+t/2)+'V'+g[2]+'Z',.86);
    return centered(mathCompose([[b,0,0],[stem,0,0]],b.w));
  }
  const relations={'⩞':['=','∧'],'⪷':['≺','≈'],'⪸':['≻','≈'],'⫅':['⊂','='],'⫆':['⊃','='],
    '⪵':['≺','=',1],'⪶':['≻','=',1],'⪹':['≺','≈',1],'⪺':['≻','≈',1],'⫋':['⊂','=',1],'⫌':['⊃','=',1]};
  if(relations[value]) {
    const [upper,lower,negated]=relations[value],a=draw(upper,.9),b=draw(lower,.85),gap=.065*s,
      width=Math.max(draw(upper).w,draw(lower).w),extent=a.inkBottom-a.inkTop+b.inkBottom-b.inkTop+gap,
      top=-axis-extent/2,ay=top-a.inkTop,by=top+a.inkBottom-a.inkTop+gap-b.inkTop,
      items=[[a,(width-a.w)/2,ay],[b,(width-b.w)/2,by]];
    if(negated) {
      const height=b.inkBottom-b.inkTop+.12*s,half=.13*s,thickness=line*Math.SQRT2/2,
        y=by+(b.inkTop+b.inkBottom)/2,x=width/2;
      const path='M'+[x-half,y+height/2].map(mathNumber).join(' ')+'L'+[x+half,y-height/2].map(mathNumber).join(' ')+
        'l'+[thickness,thickness].map(mathNumber).join(' ')+'L'+[x-half+thickness,y+height/2+thickness].map(mathNumber).join(' ')+'Z';
      items.push([mathBox(0,0,0,'<path d="'+path+'"/>',{left:x-half,right:x+half+thickness,inkTop:y-height/2,inkBottom:y+height/2+thickness}),0,0]);
    }
    return mathCompose(items,width,extra);
  }
  if(value==='⇠'||value==='⇢') {
    const right=value==='⇢',b=draw(right?'→':'←'),g=MATH_FONT.glyph(b.glyph),unit=b.unitScale,
      width=Math.max(b.w,extra.stretchAxis==='horizontal'?extra.stretchTarget || 0:0),added=width-b.w,
      split=g[0]*(right?.65:.35);let command='',coordinate=0;
    const path=g[7].replace(/[MLHVCZ]|-?\d+(?:\.\d+)?/g,token=>{
      if(/[MLHVCZ]/.test(token)){command=token;coordinate=0;return token;}
      const isX=command!=='V'&&(command==='H'||coordinate%2===0);coordinate++;
      return isX?mathNumber(right?Math.max(split,Number(token)):Math.min(split,Number(token))):token;
    });
    const head={...b,svg:b.svg.replace('d="'+g[7]+'"','d="'+path+'"'),glyph:undefined},
      start=right?g[1]*unit:split*unit,end=right?split*unit+added:g[3]*unit+added,
      length=end-start,count=Math.max(2,Math.ceil(length/(.19*s)));
    if(count>2048)throw Object.assign(new Error('Mathematical arrow is too large'),{code:'resource-limit'});
    const dash=length/(count*1.7-.7),items=[[head,right?added:0,0]];
    for(let i=0;i<count;i++)items.push([mathRule(dash,line,-axis-line/2),start+i*dash*1.7,0]);
    return mathCompose(items,width,{stretchAxis:'horizontal',...extra});
  }
  if(value==='⨋') {
    const target=extra.stretchAxis==='vertical'?extra.stretchTarget:0,
      sum=target?mathStretch('∑',target,c):draw('∑'),integral=target?mathStretch('∫',target,c):draw('∫'),
      x=(sum.w-integral.w)/2,sy=-axis-(sum.inkTop+sum.inkBottom)/2,iy=-axis-(integral.inkTop+integral.inkBottom)/2;
    return mathCompose([[sum,0,sy],[integral,x,iy]],Math.max(sum.w,x+integral.w),{italic:integral.italic,extended:true,...extra});
  }
  if(value==='⎰'||value==='⎱') {
    const target=Math.max(s,extra.stretchAxis==='vertical'?extra.stretchTarget || 0:s),factor=Math.min(1,target/(1.5*s)),
      top=draw(value==='⎰'?'⎧':'⎫',factor),bottom=draw(value==='⎰'?'⎭':'⎩',factor),
      total=Math.max(target,top.h+bottom.h),gap=Math.max(0,total-top.h-bottom.h),width=top.w,
      ty=-axis-total/2-top.inkTop,by=ty+top.inkBottom+gap-bottom.inkTop,items=[[top,0,ty],[bottom,0,by]];
    if(gap>0) {
      const part=MATH_FONT.glyph(MATH_FONT.chars['⎪'.codePointAt(0)]),unit=s*factor/MATH_FONT.units,
        overlap=Math.max(MATH_FONT.minConnectorOverlap,40),height=gap/unit+2*overlap,
        stem=contour(part[0],0,height,'M'+part[1]+' 0V'+mathNumber(height)+'H'+part[3]+'V0Z',factor);
      items.push([stem,0,ty+top.inkBottom+gap+overlap*unit]);
    }
    return mathCompose(items,width,{extended:true,...extra});
  }
  return null;
}

// SPDX-License-Identifier: MIT
// Break only between mathematical atoms; each line keeps its complete vector ink.
const mathInkWidth = box => Math.max(box.w,box.right)-Math.min(0,box.left);

function mathFittedInk(svg, ratio, c) {
  let growth=0;
  if(c.screen)svg=svg.replace(/<path\b[^>]*\bdata-math-ink="([^"]+)"[^>]*\/>/g,(tag,original)=>{
    const scale=Number(original)*ratio,stroke=mathScreenStroke({...c,level:0,size:scale});
    const previous=Number(tag.match(/\bstroke-width="([^"]+)"/)?.[1] || 0)*scale/MATH_FONT.units;
    growth=Math.max(growth,(stroke-previous)/2);
    tag=tag.replace(/data-math-ink="[^"]+"/,'data-math-ink="'+mathNumber(scale)+'"');
    const weight='stroke-width="'+mathNumber(stroke*MATH_FONT.units/scale)+'"';
    return tag.includes('stroke-width=')?tag.replace(/stroke-width="[^"]+"/,weight):
      tag.replace('/>',' stroke="currentColor" '+weight+' stroke-linejoin="round" paint-order="stroke fill"/>');
  });
  return {svg,growth};
}

function mathFitBox(box,width,c) {
  let extent=mathInkWidth(box);
  if(extent<=width || !extent)return box;
  if(c.screen && box.refit) {
    let ratio=width/extent,next;
    for(let pass=0;pass<2;pass++) {
      next=box.refit(ratio);
      ratio=Math.min(ratio,width/mathInkWidth(next));
    }
    box=next;extent=mathInkWidth(box);
  }
  let ratio=width/extent,ink;
  // Fitting changes the final pixel size. Regrade the outlines and reserve their new ink.
  for(let pass=0;pass<3;pass++) {
    ink=mathFittedInk(box.svg,ratio,c);
    if(extent*ratio+2*ink.growth<=width)break;
    ratio=Math.max(Number.EPSILON,(width-2*ink.growth)/extent);
  }
  ink=mathFittedInk(box.svg,ratio,c);
  const scaled={...box,svg:'<g transform="scale('+mathNumber(ratio)+')">'+ink.svg+'</g>',fitted:true};
  for(const key of ['w','h','d','left','right','inkTop','inkBottom'])scaled[key]*=ratio;
  scaled.left-=ink.growth;scaled.right+=ink.growth;scaled.inkTop-=ink.growth;scaled.inkBottom+=ink.growth;
  scaled.h+=ink.growth;scaled.d+=ink.growth;
  delete scaled.rowItems;
  delete scaled.refit;
  return scaled;
}

function mathLineStack(lines,c) {
  const items=[],gap=Math.max(mathConstant('MathLeading',c,0.15),0.3*mathScale(c));
  let y=0,width=0;
  for(let i=0;i<lines.length;i++) {
    const {box,indent=0,gapBefore=0}=lines[i];
    if(i)y+=lines[i-1].box.d+gap+box.h+gapBefore;
    const x=indent-Math.min(0,box.left);
    items.push([box,x,y]);width=Math.max(width,x+Math.max(box.w,box.right));
  }
  return mathCompose(items,width,{lines:lines.reduce((sum,line)=>sum+(line.box.lines || 1),0),
    lastBaseline:y+(lines.at(-1)?.box.lastBaseline || 0),fitted:lines.some(line=>line.box.fitted)});
}

function mathPositionStack(lines,c,n) {
  const box=mathLineStack(lines,c),shift=n.position==='t'?0:n.position==='b'?-box.lastBaseline:
    (box.h-box.d)/2-mathConstant('AxisHeight',c,.25);
  return mathCompose([[box,0,shift]],box.w,{class:'inner',lines:box.lines,lastBaseline:box.lastBaseline+shift,fitted:box.fitted});
}

function mathFlowAtoms(n,box,x=0,y=0) {
  if(n.type==='row' && n.children.length && box.rowItems?.length===n.children.length)
    return n.children.flatMap((child,i)=>{const [b,dx,dy]=box.rowItems[i];return mathFlowAtoms(child,b,x+dx,y+dy);});
  if(n.type==='style' && n.width===undefined && !n.border && !n.background && !n.class && !n.limits) {
    const atoms=mathFlowAtoms(n.body,box,x,y);
    // A box the body did not unpack already carries this colour from mathLayout.
    if(n.color && !(atoms.length===1 && atoms[0][0]===box)) {
      const paint=b=>({...b,svg:'<g fill="'+mathEscape(n.color)+'" color="'+mathEscape(n.color)+'" fill-opacity="1" stroke-opacity="1">'+b.svg+'</g>',
        ...(b.refit?{refit:ratio=>paint(b.refit(ratio))}:{}),...(b.flowWrap?{flowWrap:width=>paint(b.flowWrap(width))}:{})});
      return atoms.map(([b,dx,dy])=>[paint(b),dx,dy]);
    }
    return atoms;
  }
  if(n.type==='frac' && n.bar!==false && n.barThickness!==0)box={...box,flowFactor:true};
  if(n.type==='glyph' && n.value==='⋯')box={...box,flowDots:true};
  // An explicit \bigl or \bigr class wins; an ordinary \big( still pairs by its glyph.
  if(n.type==='glyph' && '([{⌈⌊⟨⦅⟦⟪⦃)]}⌉⌋⟩⦆⟧⟫⦄'.includes(n.value))
    box={...box,flowFence:n.class==='open' || n.class==='close'?n.class:')]}⌉⌋⟩⦆⟧⟫⦄'.includes(n.value)?'close':'open'};
  return [[box,x,y]];
}

function mathRefitRow(items,advance,ratio) {
  let delta=0;
  const fresh=items.map(([b,x,y])=>{
    const next=b.refit?b.refit(ratio):b,placed=[next,x+delta,y];
    delta+=next.w-b.w;return placed;
  });
  return mathCompose(fresh,advance+delta,{fitted:fresh.some(([b])=>b.fitted)});
}

function mathWrapRow(box,c,width,{relationIndent,binaryIndent}={}) {
  if(mathInkWidth(box)<=width || !box.rowItems?.length)return mathFitBox(box,width,c);
  const atoms=box.rowItems.map(item=>[...item]),found=[];let ink=false,depth=0,previous=null;
  for(let i=0;i<atoms.length;i++) {
    const b=atoms[i][0],next=atoms[i+1]?.[0],fence=b.flowFence || b.class;
    if(fence==='close')depth=Math.max(0,depth-1);
    if(ink && (b.class==='rel' || b.class==='bin' || b.flowDots && (previous?.flowFactor && next?.flowFactor || (previous?.flowFence || previous?.class)==='close' && (next?.flowFence || next?.class)==='open')))found.push([i,depth]);
    if(fence==='open')depth++;
    if(b.svg){ink=true;previous=b;}
  }
  const breaks=[0,...found.map(([i])=>i),atoms.length],levels=[0,...found.map(([,level])=>level),0];
  // Reuse structural wrapping before shrinking an oversized, otherwise indivisible atom.
  const deltas=Array(atoms.length).fill(0);let changed=false;
  for(let segment=0;segment<breaks.length-1;segment++) {
    const start=breaks[segment],end=breaks[segment+1],origin=atoms[start]?.[1] || 0;
    let right=0,left=0;
    for(let i=start;i<end;i++){const [b,x]=atoms[i];left=Math.min(left,x-origin+b.left);right=Math.max(right,x-origin+b.right,x-origin+b.w);}
    let extent=right-left;
    if(extent<=width)continue;
    for(let i=start;i<end;i++) {
      const b=atoms[i][0];if(!b.flowWrap)continue;
      const allowance=width-(extent-mathInkWidth(b));
      if(allowance<=.2*mathScale(c))continue;
      const next=b.flowWrap(allowance),delta=next.w-b.w;
      if(Math.max(next.innerLines || 1,next.lines || 1)<2 || delta>=0)continue;
      atoms[i][0]=next;deltas[i]=delta;extent+=delta;changed=true;
    }
  }
  if(changed) {
    let shift=0,advance=0;
    for(let i=0;i<atoms.length;i++){atoms[i][1]+=shift;shift+=deltas[i];advance=Math.max(advance,atoms[i][1]+atoms[i][0].w);}
    box=mathCompose(atoms,advance,{rowItems:atoms,fitted:atoms.some(([b])=>b.fitted)});
    if(c.screen)box.refit=ratio=>mathRefitRow(atoms,advance,ratio);
  }
  if(breaks.length===2)return mathFitBox(box,width,c);
  const firstRelation=atoms.findIndex(([b])=>b.class==='rel');
  const anchor=relationIndent ?? (firstRelation>=0 && atoms[firstRelation][1]<width*0.35?atoms[firstRelation][1]:0);
  const continuation=binaryIndent ?? Math.min(anchor+mathScale(c),width*0.3);
  const minimum=breaks.slice(0,-1).map((start,i)=>{
    const origin=atoms[start][1];let left=0,right=0;
    for(let j=start;j<breaks[i+1];j++){const [b,x]=atoms[j];left=Math.min(left,x-origin+b.left);right=Math.max(right,x-origin+b.right,x-origin+b.w);}
    return right-left;
  });
  const inset=i=>{
    const wanted=i===0?0:atoms[breaks[i]][0].class==='rel'?anchor:continuation;
    return relationIndent===undefined?Math.min(wanted,Math.max(0,width-minimum[i])):wanted;
  };
  const costs=Array(breaks.length).fill(Infinity),next=Array(breaks.length).fill(0);
  costs[breaks.length-1]=0;
  // A bounded lookahead makes even thousands of break opportunities linear in input size.
  for(let start=breaks.length-2;start>=0;start--) {
    const first=breaks[start],origin=atoms[first][1],available=Math.max(.05,width-inset(start));
    let left=0,right=0,cursor=first;
    for(let end=start+1;end<Math.min(breaks.length,start+65);end++) {
      while(cursor<breaks[end]) {
        const [b,x]=atoms[cursor++];
        left=Math.min(left,x-origin+b.left);right=Math.max(right,x-origin+b.right,x-origin+b.w);
      }
      const extent=right-left,over=Math.max(0,extent-available)/available,slack=Math.max(0,available-extent)/available;
      // A break inside brackets costs more than any fitting line, yet less than overflowing one.
      const last=end===breaks.length-1,penalty=last?0:(atoms[breaks[end]][0].class==='rel'?0:18)+200*levels[end];
      const cost=costs[end]+12+penalty+(last?8:60)*slack*slack+(over?100000*(1+over*over):0);
      if(cost<costs[start]) {costs[start]=cost;next[start]=end;}
      if(extent>available && end>start+1)break;
    }
  }
  const lines=[];
  for(let start=0;start<breaks.length-1;) {
    const end=next[start] || start+1,from=breaks[start],to=breaks[end],origin=atoms[from][1],items=[];
    let advance=0;
    for(let i=from;i<to;i++) {
      const [b,x,y]=atoms[i];items.push([b,x-origin,y]);advance=Math.max(advance,x-origin+b.w);
    }
    const indent=inset(start),line=mathCompose(items,advance,{fitted:items.some(([b])=>b.fitted)});
    if(c.screen)line.refit=ratio=>mathRefitRow(items,advance,ratio);
    lines.push({box:mathFitBox(line,Math.max(.05,width-indent),c),indent});start=end;
  }
  return mathLineStack(lines,c);
}

function mathWrapAligned(n,c,width,natural) {
  if(!/^(align(?:ed)?(?:at)?|flalign|split|eqnarray|gather(?:ed)?|multline)$/.test(n.env) ||
      n.columnRules?.length || n.rowRules?.length || n.columnInsertions?.length)return mathFitBox(natural,width,c);
  if(n.env==='eqnarray')n={...n,env:'aligned',rows:n.rows.map(row=>[row[0],{type:'row',children:row.slice(1).flatMap(cell=>cell.type==='row'?cell.children:[cell])}])};
  const paired=/^(align(?:ed)?(?:at)?|flalign|split)$/.test(n.env),cellStyle={...c,display:true};
  if(!paired) {
    const lines=[];
    for(let r=0;r<n.rows.length;r++) {
      const row=n.rows[r];
      const body=row.length===1?row[0]:{type:'row',children:row};
      lines.push({box:mathResponsiveLayout(body,cellStyle,width),gapBefore:(n.rowGaps?.[r-1] || 0)*mathScale(c)});
    }
    return mathPositionStack(lines,c,n);
  }
  const rows=n.rows.map(row=>row.map(cell=>mathLayout(cell,cellStyle)));
  const leftWidth=Math.max(0,...rows.flatMap(row=>row.filter((_,i)=>i%2===0).map(mathInkWidth)));
  const separate=leftWidth>width*0.4,anchor=separate?0:leftWidth;
  const lines=[],s=mathScale(c);
  for(let r=0;r<n.rows.length;r++) {
    const row=n.rows[r],start=lines.length;
    for(let pair=0;pair<row.length;pair+=2) {
      const left=rows[r][pair],rightNode=row[pair+1] || {type:'row',children:[]};
      const rightTree={type:'row',children:[{type:'row',children:[]},...(rightNode.type==='row'?rightNode.children:[rightNode])]},right=mathRow(rightTree.children,cellStyle);
      if(c.screen)right.refit=ratio=>mathScreenRelayout(rightTree,cellStyle,ratio);
      right.rowItems=mathFlowAtoms(rightTree,right);
      const relationGap=mathSpace('ord','rel',cellStyle);
      const wrapped=mathWrapRow(right,cellStyle,Math.max(.05,width-anchor),{relationIndent:relationGap,binaryIndent:Math.min(relationGap+s,width*0.2)});
      if(separate && left.svg)lines.push({box:mathResponsiveLayout(row[pair],cellStyle,width)});
      const parts=separate?[[wrapped,0,0]]:[[left,anchor-left.w,0],[wrapped,anchor,0]];
      lines.push({box:mathCompose(parts,anchor+mathInkWidth(wrapped),{lines:wrapped.lines || 1,lastBaseline:wrapped.lastBaseline || 0,fitted:wrapped.fitted})});
    }
    if(lines[start])lines[start].gapBefore=(n.rowGaps?.[r-1] || 0)*s;
  }
  return mathPositionStack(lines,c,n);
}

function mathHasMiddle(n) {
  if(!n || typeof n!=='object' || n.type==='fence')return false;
  if(n.type==='glyph' && n.delimiter)return true;
  return Object.values(n).some(value=>Array.isArray(value)?value.some(mathHasMiddle):mathHasMiddle(value));
}

function mathResponsiveLayout(n,c,width,natural=mathLayout(n,c)) {
  if(!Number.isFinite(width) || width<=0 || mathInkWidth(natural)<=width)return natural;
  if(c.screen && !natural.refit)natural={...natural,refit:ratio=>mathScreenRelayout(n,c,ratio)};
  if(n.type==='row') {
    if(n.children.length===1)return mathResponsiveLayout(n.children[0],c,width,natural.rowItems?.[0]?.[0]);
    return mathWrapRow({...natural,rowItems:mathFlowAtoms(n,natural)},c,width);
  }
  if(n.type==='style' && n.width===undefined && !n.border && !n.background && !n.class && !n.limits) {
    const style={...c};
    if(n.variant)style.variant=n.variant;
    if(n.absoluteSize!==undefined)style.size=n.absoluteSize;
    if(n.size!==undefined)style.size*=n.size;
    if(n.mathStyle) {style.level=({display:0,text:0,script:1,scriptscript:2})[n.mathStyle];style.display=n.mathStyle==='display';style.cramped=false;}
    const box=mathResponsiveLayout(n.body,style,width);
    if(n.color)box.svg='<g fill="'+mathEscape(n.color)+'" color="'+mathEscape(n.color)+'" fill-opacity="1" stroke-opacity="1">'+box.svg+'</g>';
    return box;
  }
  if(n.type==='frac' && n.bar!==false && n.barThickness!==0 && !n.left && !n.right) {
    const wrapped=mathFraction(n,c,width);if(wrapped.innerLines>1)return mathFitBox(wrapped,width,c);
  }
  if(n.type==='table')return mathWrapAligned(n,c,width,natural);
  if(n.type==='fence' && !n.size) {
    if(mathHasMiddle(n.body))return mathFitBox(natural,width,c);
    const local={...c,delimiterTarget:undefined};
    let available=width,box=natural;
    for(let pass=0;pass<4;pass++) {
      let body=mathResponsiveLayout(n.body,local,Math.max(.05,available));
      if(body.lines>1)body=mathCompose([[body,0,(body.h-body.d)/2-mathConstant('AxisHeight',c,.25)]],body.w,{lines:body.lines,fitted:body.fitted});
      box=mathFenceBoxes(n.left,n.right,body,local);
      box.lines=body.lines;box.fitted=body.fitted;
      if(mathInkWidth(box)<=width)return box;
      available=width-(box.w-body.w)-.05;
    }
    return mathFitBox(box,width,c);
  }
  return mathFitBox(natural,width,c);
}

// SPDX-License-Identifier: MIT
function mathSvg(box,source,error,utf16,options={}) {
  if(box.svg.length>8*1024*1024)throw Object.assign(new Error('This formula produces too much SVG to render safely.'),{code:'resource-limit'});
  const pad=0.025,left=Math.min(0,box.left)-pad,right=Math.max(box.w,box.right)+pad;
  const width=Math.max(0.05,right-left),height=Math.max(0.025,box.h+pad,-box.inkTop+pad),depth=Math.max(0.025,box.d+pad,box.inkBottom+pad);
  const viewBox=[left*1000,-height*1000,width*1000,(height+depth)*1000];
  const opacity=options.screen?.dark ? .94 : 1;
  if (![width,height,depth,left,...viewBox].every(Number.isFinite)) throw new Error('Mathematical dimensions are not finite');
  const escapedSource=mathEscape(source);
  // A group exposes authored links to accessibility APIs; an image would hide them.
  const svg='<svg xmlns="http://www.w3.org/2000/svg" role="'+(box.svg.includes('<a ')?'group':'img')+'" aria-label="'+escapedSource+'"'+
    ' data-rapier-math="'+(options.displayMode?'display':'inline')+'" data-math-lines="'+(box.lines || 1)+'"'+
    ' data-math-natural-width="'+mathNumber(options.naturalWidth ?? width)+'"'+
    (options.screen?' data-math-screen="'+mathNumber(options.screen.fontSize)+'|'+mathNumber(options.screen.pixelRatio)+'|'+options.screen.dark+'"':'')+
    (options.maxWidth?' data-math-max-width="'+mathNumber(options.maxWidth)+'"':'')+
    (utf16?' data-tex-utf16="'+utf16+'"':'')+
    (error?.sourceOmitted?' data-math-source-omitted="true"':'')+
    (error?' data-math-error="'+mathEscape(error.code)+'"':'')+' width="'+mathNumber(width)+'em" height="'+mathNumber(height+depth)+'em"'+
    ' viewBox="'+viewBox.map(mathNumber).join(' ')+'"'+
    ' style="font-size:'+mathNumber(mathFontRatio)+'em;max-width:100%;height:auto;vertical-align:-'+mathNumber(depth)+'em;'+
    'fill-opacity:'+opacity+';stroke-opacity:'+opacity+'" fill="currentColor">'+
    '<title>'+escapedSource+'</title>'+(error?'<desc>'+mathEscape(error.message)+'</desc>':'')+
    '<g transform="scale(1000)">'+box.svg+'</g></svg>';
  if(svg.length>24*1024*1024)throw Object.assign(new Error('The complete formula markup exceeds its output budget.'),{code:'resource-limit'});
  return {svg,width,height,depth,lines:box.lines || 1,fitted:!!box.fitted,errors:error?[error]:[]};
}

function mathRenderPrepared(prepared,options={}) {
  const {text,safe,tree,error:parseError}=prepared;
  const context={size:1,level:0,variant:'normal',cramped:false,display:!!options?.displayMode,spans:!!options?.spans,cache:new WeakMap(),budget:{nodes:0,outlineBytes:0}};
  try {
    if(safe.error)throw safe.error;
    if(options?.screen!==undefined) {
      const {fontSize,pixelRatio,dark}=options.screen || {},scaled=Number.isFinite(fontSize)?fontSize*mathFontRatio:NaN;
      if(!Number.isFinite(fontSize) || fontSize<=0 || !Number.isFinite(pixelRatio) || pixelRatio<=0 ||
        typeof dark!=='boolean' || !Number.isFinite(scaled) || scaled<=0 || !Number.isFinite(scaled*pixelRatio) || scaled*pixelRatio<=0 ||
        !Number.isFinite(1/scaled) || !Number.isFinite(1/pixelRatio) || !Number.isFinite(1/(scaled*pixelRatio)))
        throw Object.assign(new Error('Screen font size, pixel ratio and device scale must be positive and finite; dark must be a boolean.'),{code:'invalid-screen'});
      context.screen={fontSize:scaled,pixelRatio,dark};
    }
    if(parseError)throw parseError;
    const natural=mathLayout(tree,context),limit=Number(options?.maxWidth);
    const maxWidth=Number.isFinite(limit) && limit>.1?limit:undefined;
    const box=maxWidth && mathInkWidth(natural)>maxWidth-.05?mathResponsiveLayout(tree,context,maxWidth-.05,natural):natural;
    return mathSvg(box,safe.alternative,undefined,safe.utf16,{displayMode:context.display,maxWidth,naturalWidth:mathInkWidth(natural)+.05,screen:context.screen});
  }
  catch (cause) {
    const error=mathDiagnostic(cause);
    // A diagnostic is visible, but remains distinct from a successfully typeset formula.
    // Diagnostics have an explicit bound. Exact input stays in the source alternative.
    const label=error.message.length>240?'This formula could not be rendered. The complete diagnostic is in its text description.':error.message.replace(/[^\x20-\x7e]/g,'?');
    const diagnostic={...context,variant:'roman',size:0.8,budget:{nodes:0,outlineBytes:0}};
    try {
      return mathSvg(mathText(label,diagnostic),safe.alternative,error,safe.utf16,{displayMode:context.display,screen:context.screen});
    } catch {
      diagnostic.screen=undefined;
      return mathSvg(mathText(label,diagnostic),safe.alternative,error,safe.utf16,{displayMode:context.display});
    }
  }
}

function renderMath(source,options={}) {
  return mathRenderPrepared(mathPrepare(source,options),options);
}
function mathRenderToString(source,options) { return renderMath(source,options).svg; }

// SPDX-License-Identifier: MIT
// The browser supplies the column and physical pixel grid; rendering remains synchronous and pure.
const mathBrowserStates=new WeakMap(),mathBrowserDocuments=new WeakMap(),mathRuleOriginals=new WeakMap();
const mathSvgSelector='svg[data-rapier-math]:not([data-math-error])';

function mathElements(root) {
  return [...(root?.matches?.(mathSvgSelector)?[root]:[]),...root?.querySelectorAll?.(mathSvgSelector) || []];
}

function mathColumn(svg) {
  const view=svg.ownerDocument.defaultView;
  for(let node=svg.parentElement;node;node=node.parentElement) {
    const style=view.getComputedStyle(node);
    if(style.display==='contents' || style.display==='inline' || node.matches('.math-rendered'))continue;
    return node;
  }
  return svg.ownerDocument.documentElement;
}

function mathDarkPaper(svg) {
  const view=svg.ownerDocument.defaultView;
  if(view.matchMedia('(forced-colors: active)').matches || view.matchMedia('(prefers-contrast: more)').matches)return false;
  for(let node=svg.parentElement;node;node=node.parentElement) {
    const style=view.getComputedStyle(node),color=style.backgroundColor.match(/[\d.]+/g)?.map(Number);
    if(style.backgroundImage!=='none')return false;
    if(!color || color.length<3 || (color[3] ?? 1)<1)continue;
    const rgb=color.slice(0,3).map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722<.18;
  }
  return false;
}

function mathSnapRule(original, matrix, ratio) {
  if (!original.width || !original.height || !matrix || !matrix.a || !matrix.d ||
      Math.abs(matrix.b) + Math.abs(matrix.c) > 1e-6 || !(ratio > 0)) return null;
  const snap = value => Math.round(value * ratio) / ratio;
  const x = (snap(original.x * matrix.a + matrix.e) - matrix.e) / matrix.a;
  const y = (snap(original.y * matrix.d + matrix.f) - matrix.f) / matrix.d;
  const width = Math.max(1 / ratio, snap(original.width * Math.abs(matrix.a))) / Math.abs(matrix.a);
  const height = Math.max(1 / ratio, snap(original.height * Math.abs(matrix.d))) / Math.abs(matrix.d);
  return {x, y, width, height, d: 'M' + mathNumber(x) + ' ' + mathNumber(y) + 'h' + mathNumber(width) +
    'v' + mathNumber(height) + 'h' + mathNumber(-width) + 'Z'};
}

// Every rule is measured before any is rewritten, so the browser lays the page out once, not once per formula.
function mathSnapRules(svgs) {
  const measured=[];
  for(const svg of svgs)for(const rule of svg.querySelectorAll('[data-math-rule],[data-math-line]')) {
    let original=mathRuleOriginals.get(rule);
    if(!original) {
      const box=rule.getBBox(), axis=rule.getAttribute('data-math-line'), thickness=Number(rule.getAttribute('stroke-width'));
      original={x:box.x,y:box.y,width:box.width,height:box.height,axis};
      if(axis==='horizontal') {original.y-=thickness/2;original.height=thickness;}
      if(axis==='vertical') {original.x-=thickness/2;original.width=thickness;}
      mathRuleOriginals.set(rule,original);
    }
    measured.push([rule,original,rule.getScreenCTM(),svg.ownerDocument.defaultView.devicePixelRatio || 1]);
  }
  for(const [rule,original,matrix,ratio] of measured) {
    const snapped=mathSnapRule(original,matrix,ratio);
    if(!snapped)continue;
    let path=snapped.d;
    if(original.axis==='horizontal') {
      path='M'+mathNumber(snapped.x)+' '+mathNumber(snapped.y+snapped.height/2)+'h'+mathNumber(snapped.width);
      rule.setAttribute('stroke-width',mathNumber(snapped.height));
    }
    if(original.axis==='vertical') {
      path='M'+mathNumber(snapped.x+snapped.width/2)+' '+mathNumber(snapped.y)+'v'+mathNumber(snapped.height);
      rule.setAttribute('stroke-width',mathNumber(snapped.width));
    }
    rule.setAttribute('d',path);
    rule.setAttribute('shape-rendering','crispEdges');
  }
}

// Reads only: the column, font and paper of one formula.
function mathFitMeasure(svg, printing) {
  if(!svg.isConnected)return null;
  const view=svg.ownerDocument.defaultView,column=mathColumn(svg),style=view.getComputedStyle(column),font=parseFloat(view.getComputedStyle(svg).fontSize);
  const available=column.clientWidth-(parseFloat(style.paddingLeft) || 0)-(parseFloat(style.paddingRight) || 0);
  if(!(available>0 && font>0))return {column};
  return {svg,column,font,width:Math.max(.1,(available-.25)/font),dark:!printing && mathDarkPaper(svg),ratio:view.devicePixelRatio || 1};
}

// Writes only: re-render and restyle one measured formula.
function mathFitApply({svg,font,width,dark,ratio}, printing) {
  const doc=svg.ownerDocument,view=doc.defaultView,source=svg.getAttribute('aria-label'),display=svg.getAttribute('data-rapier-math')==='display';
  const screen=printing?undefined:{fontSize:font/mathFontRatio,pixelRatio:ratio,dark};
  const screenKey=printing?'':mathNumber(font)+'|'+mathNumber(ratio)+'|'+dark;
  let state=mathBrowserStates.get(svg);
  if(!state || state.source!==source) {
    state={source,natural:Number(svg.getAttribute('data-math-natural-width')) || Infinity,width:Number(svg.getAttribute('data-math-max-width')) || null,
      screen:svg.getAttribute('data-math-screen') || ''};
    mathBrowserStates.set(svg,state);
  }
  const target=state.natural>width?width:null;
  if(screenKey!==state.screen || (target===null)!==(state.width===null) || target!==null && Math.abs(target-state.width)>.005) {
    const rendered=renderMath(source,{displayMode:display,maxWidth:(screenKey!==state.screen?width:target) || undefined,screen});
    if(!rendered.errors.length) {
      const active=doc.activeElement,links=active && svg.contains(active)?[...svg.querySelectorAll('a')]:[];
      const focusIndex=links.indexOf(active),focusHref=focusIndex<0?null:active.getAttribute('href');
      const replacement=new view.DOMParser().parseFromString(rendered.svg,'image/svg+xml').documentElement;
      for(const name of ['role','width','height','viewBox','data-math-natural-width','data-math-max-width','data-math-lines','data-math-screen']) {
        if(replacement.hasAttribute(name))svg.setAttribute(name,replacement.getAttribute(name));else svg.removeAttribute(name);
      }
      svg.style.verticalAlign=replacement.style.verticalAlign;
      svg.replaceChildren(...Array.from(replacement.childNodes,node=>doc.importNode(node,true)));
      if(focusIndex>=0 && (!doc.activeElement || doc.activeElement===doc.body)) {
        const link=svg.querySelectorAll('a')[focusIndex];
        if(link?.getAttribute('href')===focusHref)link.focus({preventScroll:true});
      }
      state.natural=Number(svg.getAttribute('data-math-natural-width'));state.screen=screenKey;
      state.width=state.natural>width?width:null;
      if(state.width===null)svg.removeAttribute('data-math-max-width');
    }
  }
  const opacity=dark?'.94':'1';
  svg.style.fillOpacity=opacity;svg.style.strokeOpacity=opacity;
  for(const node of svg.querySelectorAll('[fill],[color],[stroke]')) {
    if(['fill','color','stroke'].some(name=>node.hasAttribute(name) && !['none','currentColor','inherit'].includes(node.getAttribute(name)))) {
      node.setAttribute('fill-opacity','1');node.setAttribute('stroke-opacity','1');
    }
  }
}

// All formulas are measured, then all rewritten, then all rules snapped: three layouts for any number of formulas.
function mathFitElements(svgs, printing) {
  const measured=svgs.map(svg=>mathFitMeasure(svg,printing)).filter(Boolean),fitted=measured.filter(item=>item.svg);
  for(const item of fitted)mathFitApply(item,printing);
  if(!printing)mathSnapRules(fitted.map(item=>item.svg));
  return measured.map(item=>item.column);
}

function mathFit(root) {
  const nodes=mathElements(root);
  if(nodes.length)mathFitElements(nodes,nodes[0].ownerDocument.defaultView.matchMedia('print').matches);
  return nodes.length;
}

function mathObserveDocument(doc) {
  const view=doc.defaultView,nodes=new Map(),columns=new Set();
  let frame=null,active=true,printing=view.matchMedia('print').matches;
  const refresh=()=> {
    if(!active)return;
    if(frame!==null)view.cancelAnimationFrame(frame);
    frame=null;
    const wanted=new Set(mathFitElements([...nodes.keys()].filter(svg=>svg.isConnected && svg.ownerDocument===doc && svg.matches(mathSvgSelector)),printing));
    for(const column of columns)if(!wanted.has(column)) {resize.unobserve(column);columns.delete(column);}
    for(const column of wanted)if(!columns.has(column)) {resize.observe(column);columns.add(column);}
  };
  const schedule=()=>{if(active && frame===null)frame=view.requestAnimationFrame(refresh);};
  const resize=new view.ResizeObserver(schedule),theme=new view.MutationObserver(records=>{
    for(const {target} of records)for(const svg of nodes.keys())
      if(target!==svg && target.contains(svg)) {schedule();return;}
  });
  const beforePrint=()=>{printing=true;refresh();},afterPrint=()=>{printing=false;schedule();};
  const media=['(forced-colors: active)','(prefers-contrast: more)','(prefers-color-scheme: dark)'].map(query=>view.matchMedia(query));
  const fonts=doc.fonts;
  theme.observe(doc.documentElement,{subtree:true,attributes:true,attributeFilter:['class','style','data-rapier-theme','data-md-theme']});
  view.addEventListener('resize',schedule,{passive:true});
  view.addEventListener('beforeprint',beforePrint);view.addEventListener('afterprint',afterPrint);
  for(const query of media)query.addEventListener('change',schedule);
  fonts?.addEventListener('loadingdone',schedule);
  const state={nodes,schedule,dispose:()=>{
    active=false;
    if(frame!==null)view.cancelAnimationFrame(frame);
    frame=null;
    resize.disconnect();theme.disconnect();columns.clear();nodes.clear();
    view.removeEventListener('resize',schedule);
    view.removeEventListener('beforeprint',beforePrint);view.removeEventListener('afterprint',afterPrint);
    for(const query of media)query.removeEventListener('change',schedule);
    fonts?.removeEventListener('loadingdone',schedule);
    mathBrowserDocuments.delete(doc);
  }};
  mathBrowserDocuments.set(doc,state);
  return state;
}

function mathObserve(root) {
  const doc=root?.ownerDocument || root;
  if(!doc?.defaultView)return ()=>{};
  let owned=mathElements(root);
  if(!owned.length)return ()=>{};
  let state=mathBrowserDocuments.get(doc) || mathObserveDocument(doc);
  // Each returned cleanup owns its subscription, including overlap and detached nodes.
  for(const svg of owned)state.nodes.set(svg,(state.nodes.get(svg) || 0)+1);
  state.schedule();
  return ()=>{
    if(!owned)return;
    const current=state;state=null;
    for(const svg of owned) {
      const remaining=current.nodes.get(svg)-1;
      if(remaining)current.nodes.set(svg,remaining);else current.nodes.delete(svg);
    }
    owned=null;
    if(current.nodes.size)current.schedule();else current.dispose();
  };
}

// SPDX-License-Identifier: MIT
// One bounded walk of the admitted TeX tree. This is Presentation MathML, not a
// second grammar, a content-math inference engine or a public AST input API.
const MATH_ML_OPAQUE_COLOR = /^(?:aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)$/i;
const MATH_ML_NAMESPACE = 'http://www.w3.org/1998/Math/MathML';
const MATH_ML_INVALID_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/u;
function mathMLXML(value) {
  const text = String(value);
  if (MATH_ML_INVALID_XML.test(text))
    throw {code: 'invalid-semantic-character', offset: 0, message: 'A generated mathematical character is not valid XML.'};
  return text.replace(/[&<>"'\t\n\r]/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '\t': '&#9;', '\n': '&#10;', '\r': '&#13;'}[character]));
}

function mathML(tree, source, safeSource, options = {}) {
  const metrics = {nodes: 0, depth: 0, outputCodeUnits: 0, links: 0};
  const diagnostics = [], codes = new Set(), active = new WeakSet();
  const sourceOmitted = source.length > 1000000 || !!safeSource?.error?.sourceOmitted;
  // HAST stringifiers can emit decoded CR literally; a subsequent HTML parse
  // normalizes it. ASCII custody survives that real host pipeline unchanged.
  const utf16 = sourceOmitted ? null : (safeSource?.utf16 ?? null);
  const encoding = sourceOmitted ? null : utf16 === null ? 'application/x-tex' : 'application/x-rapier-tex-utf16';
  const sourceInfo = {encoding, ...(sourceOmitted ? {omitted: true} : {})};
  let parts = [], length = 0, content = 0;
  const fail = (code, message) => { throw {code, message, offset: 0}; };
  const write = value => {
    length += value.length;
    if (length > 8 * 1024 * 1024) fail('resource-limit', 'MathML presentation exceeds its output budget.');
    parts.push(value);
  };
  const open = (name, attributes = {}) => {
    let value = '<' + name;
    for (const [key, item] of Object.entries(attributes)) if (item !== undefined)
      value += ' ' + key + '="' + mathMLXML(item) + '"';
    write(value + '>');
  };
  const close = name => write('</' + name + '>');
  const token = (name, value, attributes, context) => {
    open(name, attributes); write(mathMLXML(value)); close(name);
    if (!context?.phantom && !context?.transparent && /[^\p{White_Space}\p{Default_Ignorable_Code_Point}]/u.test(value)) content++;
  };
  const decimal = value => {
    if (!Number.isFinite(value)) fail('invalid-semantic-value', 'A mathematical dimension is not finite.');
    return String(Math.round(value * 1e6) / 1e6 || 0);
  };
  const em = value => decimal(value) + 'em';
  const warn = (code, message) => {
    if (!codes.has(code)) { codes.add(code); diagnostics.push({code, message, offset: 0}); }
  };
  const visit = (node, depth) => {
    if (++metrics.nodes > 100000) fail('resource-limit', 'MathML traversal exceeds its work budget.');
    metrics.depth = Math.max(metrics.depth, depth);
    if (depth > 512) fail('resource-limit', 'MathML is nested too deeply.');
    if (!node || typeof node !== 'object') fail('unsupported-semantic-node', 'A mathematical part is missing.');
  };
  const family = node => {
    const role = node.semanticRole;
    if (role === 'chemistry') warn('semantic-chemistry-presentation', 'Chemical notation retains presentation structure; chemical element, bond, charge and reaction meanings are not inferred.');
    else if (role === 'physics') warn('semantic-physics-presentation', 'Physics notation retains its parsed mathematical relationships; physical and specialized operator meanings are not inferred.');
    else if (role === 'units') warn('semantic-units-presentation', 'Unit notation retains the parser-expanded mathematical structure; quantities and unit identities are not inferred.');
    else if (role === 'tag') warn('semantic-tag-presentation', 'An authored tag remains following content; no equation identity, numbering or cross-reference semantics are assigned.');
  };
  // An operator's form and movable limits belong to it alone, not to the expressions inside it.
  const inner = context => ({...context, form: undefined, movableLimits: undefined});
  const scriptContext = context => ({...inner(context), display: false, level: Math.min(2, context.level + 1)});
  const styledContext = (context, node) => {
    const next = {...context};
    if (node.variant) next.variant = node.variant;
    // Invalid names inherit the current color; they cannot prove visibility.
    if (/^(?:transparent|#[\da-f]{3}0|#[\da-f]{6}00)$/i.test(node.color || '')) next.transparent = true;
    else if (node.color && (/^#/.test(node.color) || MATH_ML_OPAQUE_COLOR.test(node.color))) next.transparent = false;
    if (node.absoluteSize !== undefined) next.size = node.absoluteSize;
    if (node.size !== undefined) next.size *= node.size;
    if (node.mathStyle) { next.display = node.mathStyle === 'display'; next.level = {display: 0, text: 0, script: 1, scriptscript: 2}[node.mathStyle]; }
    return next;
  };
  const variant = (node, context) => node.variant || (context.variant === 'normal' ? node.defaultVariant || (node.type === 'text' ? 'roman' : 'normal') : context.variant);
  const styledText = (value, face) => {
    // Native Core supports only mi mathvariant=normal. The shared pure Unicode
    // mapping keeps mathematical alphabets meaningful without loading the font.
    if (face === 'roman') return value;
    let result = '';
    for (const character of value) result += String.fromCodePoint(mathStyledCodePoint(character.codePointAt(0), face));
    return result;
  };
  const atom = (node, value, kind, context, attributes = {}) => {
    const face = variant(node, context);
    if (kind === 'mtext') {
      let css = '';
      if (face.includes('bold')) css += 'font-weight:700;';
      if (face.includes('italic')) css += 'font-style:italic;';
      if (face.includes('sans-serif')) css += 'font-family:sans-serif;';
      else if (face === 'monospace') css += 'font-family:monospace;';
      if (/script|fraktur|double-struck/.test(face)) {
        attributes.mathvariant = face;
        warn('semantic-text-variant', 'This text alphabet uses the MathML 3 mathvariant extension; a Core host may show ordinary text while preserving the text content.');
      }
      if (css) attributes.style = css;
      // MathML trims token whitespace; \text{if } keeps its spaces only as no-break spaces.
      token(kind, value.replace(/ /g, '\u00a0'), attributes, context); return;
    }
    // A single-character mi is italic by default in MathML Core; the plain letter is what assistive technology speaks.
    const styled = kind === 'mi' && (face === 'normal' || face === 'italic') && [...value].length === 1 ? value : styledText(value, face);
    if (kind === 'mo' && context.movableLimits !== undefined) attributes.movablelimits = String(context.movableLimits);
    if (kind === 'mi' && face !== 'normal' && face !== 'italic') attributes.mathvariant = 'normal';
    token(kind, styled, attributes, context);
  };
  const kind = node => node.tokenKind || (/^\p{Decimal_Number}+$/u.test(node.value) ? 'mn' : /^[∞∅ℵℶℷℸ℘℧⅁]$/.test(node.value) ? 'mi' :
    ['op', 'bin', 'rel', 'open', 'close', 'punct', 'inner'].includes(node.class) ||
    /^[\p{Sm}\p{P}\p{Sc}\p{So}\p{Sk}\u2061-\u2064]$/u.test(node.value) ? 'mo' : 'mi');
  const classOf = node => {
    if (!node) return undefined;
    if (node.class) return node.class;
    if (node.type === 'row' && node.group) return 'ord';
    if (node.type === 'scripts' || node.type === 'accent') return classOf(node.base);
    if (node.type === 'style' || node.type === 'link') return classOf(node.body);
    if (node.type === 'row' && node.children.length === 1) return classOf(node.children[0]);
    return 'ord';
  };
  const limitsOf = node => {
    if (!node) return undefined;
    if (node.limits) return node.limits;
    if (node.type === 'row' && node.group) return undefined;
    if (node.type === 'style' || node.type === 'link') return limitsOf(node.body);
    if (node.type === 'row' && node.children.length === 1) return limitsOf(node.children[0]);
    if (node.type === 'accent') return limitsOf(node.base);
    return undefined;
  };
  const plain = (node, depth, strict = false) => {
    visit(node, depth); family(node);
    if (strict && node.variant && node.variant !== 'roman') return null;
    if (node.type === 'text' || !strict && node.type === 'glyph') return node.value;
    if (node.type !== 'row') return null;
    const values = [];
    for (const child of node.children) {
      const value = plain(child, depth + 1, strict);
      if (value === null) return null;
      values.push(value);
    }
    return values.join('');
  };
  const fence = (value, form, context, size) => {
    if (value) token('mo', value, {fence: 'true', form, stretchy: 'true', symmetric: 'true', ...(size ? {minsize: em(size), maxsize: em(size)} : {})}, context);
  };
  const numberPart = node => node?.type === 'glyph' && !node.semanticRole && !node.tokenKind && !node.large && !node.delimiter &&
    !node.delimiterSize && (!node.class || node.class === 'ord') && /^[\p{Decimal_Number}.]$/u.test(node.value);
  const sameNumberStyle = (left, right) => left.variant === right.variant && left.defaultVariant === right.defaultVariant;
  const singleToken = node => {
    while (node?.type === 'row' && !node.semanticRole && node.children.length === 1) node = node.children[0];
    return node?.type === 'glyph' || node?.type === 'text' ? node : null;
  };

  function scripts(node, context, depth, base) {
    if (node.pre) {
      open('mmultiscripts');
      if (base) base(); else emit(node.base, {...context, form: undefined, movableLimits: false}, depth + 1);
      open('mprescripts'); close('mprescripts');
      for (const part of [node.sub, node.sup]) {
        if (part) emit(part, scriptContext(context), depth + 1);
        else { open('mrow'); close('mrow'); }
      }
      close('mmultiscripts'); return;
    }
    const limits = node.limits || limitsOf(node.base), stacked = limits === 'always' || limits === 'display' && context.display && context.level === 0;
    const name = stacked ? node.sub && node.sup ? 'munderover' : node.sub ? 'munder' : 'mover' : node.sub && node.sup ? 'msubsup' : node.sub ? 'msub' : 'msup';
    open(name, stacked ? {accent: node.sup ? 'false' : undefined, accentunder: node.sub ? 'false' : undefined} : {});
    if (base) base(); else emit(node.base, {...context, form: undefined, movableLimits: stacked ? false : undefined}, depth + 1);
    if (node.sub) emit(node.sub, scriptContext(context), depth + 1);
    if (node.sup) emit(node.sup, scriptContext(context), depth + 1);
    close(name);
  }

  function row(children, context, depth) {
    if (children.some(node => node.type === 'choice')) {
      const selected = [];
      let selectionContext = context;
      const append = (nodes, level) => {
        for (const node of nodes) {
          if (node.type === 'style' && node.mathStyle && node.declaration && node.body.type === 'row' && !node.body.children.length)
            selectionContext = styledContext(selectionContext, node);
          if (node.type !== 'choice') { selected.push(node); continue; }
          visit(node, level); family(node);
          if (active.has(node)) fail('unsupported-semantic-node', 'A mathematical tree contains a cycle.');
          active.add(node);
          const branch = mathChoice(node, selectionContext);
          visit(branch, level + 1);
          append(branch.children, level + 2);
          active.delete(node);
        }
      };
      append(children, depth + 1); children = selected;
      if (children.length !== 1) context = {...context, ordinary: undefined};
    }
    // movablelimits belongs to an operator that is itself the base, not to operators inside a compound base.
    if (children.length > 1) context = {...context, movableLimits: undefined};
    open('mrow');
    let previous, styled = false;
    for (let index = 0; index < children.length; index++) {
      const node = children[index];
      if (node.type === 'style' && node.mathStyle && node.declaration && node.body.type === 'row' && !node.body.children.length) {
        visit(node, depth + 1); visit(node.body, depth + 2); context = styledContext(context, node);
        if (styled) close('mstyle');
        open('mstyle', {displaystyle: String(context.display), scriptlevel: String(context.level)}); styled = true; continue;
      }
      // The parser's prescript uses a phantom nucleus followed by the real nucleus for SVG placement.
      if (node.type === 'scripts' && node.pre && node.base?.type === 'phantom' && node.base.body === children[index + 1]) {
        emit({...node, base: children[++index]}, context, depth + 1);
        previous = classOf(node.base.body); continue;
      }
      if (numberPart(node)) {
        let end = index + 1;
        while (end < children.length && numberPart(children[end]) && sameNumberStyle(node, children[end])) end++;
        const scripted = children[end]?.type === 'scripts' && !children[end].semanticRole && numberPart(children[end].base) && sameNumberStyle(node, children[end].base) ? children[end] : null;
        const values = children.slice(index, end).map(child => child.value).join('') + (scripted ? scripted.base.value : '');
        // A malformed multi-dot run is not silently split into apparent decimal
        // numbers. Groups, explicit spaces, styles and scripts are hard borders.
        if (/^(?:\p{Decimal_Number}+(?:\.\p{Decimal_Number}*)?|\.\p{Decimal_Number}+)$/u.test(values)) {
          for (let at = index; at < end; at++) visit(children[at], depth + 1);
          if (scripted) {
            visit(scripted, depth + 1); visit(scripted.base, depth + 2);
            scripts(scripted, context, depth + 1, () => atom(node, values, 'mn', context)); end++;
          } else atom(node, values, 'mn', context);
          previous = 'ord'; index = end - 1; continue;
        }
        // Consume an invalid run in one pass. Reconsidering each suffix both
        // invents decimals (6.7.8 -> 6 . 7.8) and makes dot-only input quadratic.
        for (let at = index; at < end; at++) emit(children[at], context, depth + 1);
        if (scripted) { emit(scripted, context, depth + 1); end++; }
        previous = 'ord'; index = end - 1; continue;
      }
      let form;
      if ((node.type === 'glyph' || node.type === 'style' && node.body.type === 'glyph') && classOf(node) === 'bin') {
        // TeX's rule 5: a binary operator before a relation, a closing symbol or nothing is not infix.
        const next = children.slice(index + 1).find(child => child.type !== 'space' && !(child.type === 'style' && child.mathStyle && child.declaration && child.body.type === 'row' && !child.body.children.length));
        form = !previous || ['bin', 'op', 'rel', 'open', 'punct'].includes(previous) ? 'prefix' : !next || ['rel', 'close', 'punct'].includes(classOf(next)) ? 'postfix' : 'infix';
      }
      emit(node, {...context, form}, depth + 1);
      if (node.type !== 'space') previous = classOf(node);
    }
    if (styled) close('mstyle');
    close('mrow');
  }

  function table(node, context, depth) {
    const rows = node.rows, columns = Math.max(node.align?.length || 0, node.pairs ? node.pairs * 2 : 0, ...rows.map(cells => cells.length));
    const insertions = node.columnInsertions || [], rules = (node.columnRules?.length || 0) + (node.rowRules?.length || 0);
    if (columns > 256 || rows.length > 2048 || rows.length * (columns + insertions.length) + rules > 100000)
      fail('resource-limit', 'MathML table composition exceeds its work budget.');
    for (const boundary of node.columnRules || []) if (!Number.isInteger(boundary) || boundary < 0 || boundary > columns)
      fail('invalid-rule', 'An array rule exceeds its columns.');
    for (const rule of node.rowRules || []) {
      const from = rule.from ?? 0, to = rule.to ?? columns;
      if (!Number.isInteger(rule.before) || rule.before < 0 || rule.before > rows.length || !Number.isInteger(from) ||
        !Number.isInteger(to) || from < 0 || from > to || to > columns)
        fail('invalid-rule', 'An array rule exceeds its cells.');
    }
    if (insertions.length || rules) warn('semantic-array-presentation', 'Array insertion content is preserved in adjacent cells; decorative row and column rules have no additional mathematical meaning and are omitted.');
    const before = Array.from({length: columns + 1}, () => []);
    for (const insertion of insertions) {
      if (!Number.isInteger(insertion.before) || insertion.before < 0 || insertion.before > columns)
        fail('invalid-alignment', 'A MathML array insertion exceeds its columns.');
      before[insertion.before].push(insertion.body);
    }
    const small = /smallmatrix$/.test(node.env) || node.env === 'subarray' || node.env === 'substack';
    const display = /^(align(?:ed)?(?:at)?|flalign|split|[lr]?gather(?:ed)?|eqnarray|multline(?:d)?|equation|drcases|dcases|darray)$/.test(node.env);
    const cellContext = {...context, display: small ? false : display, level: small ? Math.max(1, context.level) : context.level};
    const delimiters = mathTableDelimiters(node.env);
    if (delimiters) { open('mrow'); fence(delimiters[0], 'prefix', context); }
    open('mtable', {displaystyle: String(cellContext.display), scriptlevel: String(cellContext.level), 'data-math-environment': node.env});
    for (let at = 0; at < rows.length; at++) {
      open('mtr');
      // \intertext spans the whole row at its left; \multicolumn and \hdotsfor span their columns.
      const intertext = rows[at][0]?.intertext;
      for (let column = 0; column < (intertext ? 1 : columns); column++) {
        if (++metrics.nodes > 100000) fail('resource-limit', 'MathML table cells exceed its work budget.');
        const cell = rows[at][column];
        if (cell?.covered) continue;
        let align = intertext ? 'l' : cell?.spanAlign || (node.env === 'eqnarray' ? ['r', 'c', 'l'][column % 3] : node.align?.[column] || 'c');
        if (/^multlined?$/.test(node.env) && columns === 1) align = at === 0 ? 'l' : at === rows.length - 1 ? 'r' : 'c';
        const span = intertext ? columns : cell?.span > 1 ? Math.min(cell.span, columns - column) : 0;
        open('mtd', {...(span > 1 ? {columnspan: String(span)} : {}), style: 'text-align:' + ({l: 'left', r: 'right', c: 'center'}[align] || 'center')});
        open('mrow');
        for (const body of before[column]) emit(body, cellContext, depth + 1);
        if (cell?.dots) token('mo', '…', {stretchy: 'false'}, cellContext);
        else if (cell) emit(cell, cellContext, depth + 1);
        if (column + Math.max(1, span) >= columns) for (const body of before[columns]) emit(body, cellContext, depth + 1);
        close('mrow'); close('mtd');
      }
      close('mtr');
    }
    close('mtable');
    if (delimiters) { fence(delimiters[1], 'postfix', context); close('mrow'); }
    if (node.position || node.rowGaps?.some(value => value))
      warn('semantic-table-spacing', 'Table row and cell relationships are preserved; custom baseline placement and row gaps are not reproduced.');
  }

  function emit(node, context, depth = 0) {
    visit(node, depth); family(node);
    if (active.has(node)) fail('unsupported-semantic-node', 'A mathematical tree contains a cycle.');
    active.add(node);
    try {
      switch (node.type) {
        // A braced group is an ordinary atom in TeX; an operator alone in it takes no spacing of its own.
        case 'row': row(node.children, node.group && node.children.length === 1 ? {...context, ordinary: true} : {...context, ordinary: undefined}, depth); break;
        case 'choice': emit(mathChoice(node, context), context, depth + 1); break;
        case 'glyph': {
          const name = kind(node), attributes = {};
          if (name === 'mo') {
            if (node.class === 'open' || node.class === 'close') { attributes.fence = String(!/^[!?]$/.test(node.value)); attributes.form = node.class === 'open' ? 'prefix' : 'postfix'; }
            else if (node.class === 'punct') attributes.separator = 'true';
            else if (context.form) attributes.form = context.form;
            if (node.large !== undefined) attributes.largeop = String(!!node.large);
            if (node.limits) attributes.movablelimits = String(node.limits === 'display');
            if (node.delimiter || node.delimiterSize || node.stretch) attributes.stretchy = 'true';
            else attributes.stretchy = 'false';
            if (node.delimiterSize) attributes.minsize = attributes.maxsize = em(node.delimiterSize);
            else if (node.minWidth) attributes.minsize = em(node.minWidth);
            if (node.class === 'ord' && node.tokenKind === 'mo') attributes.lspace = attributes.rspace = '0em';
            if (context.ordinary) { attributes.lspace = attributes.rspace = '0em'; if (node.limits) attributes.movablelimits = 'false'; }
          }
          atom(node, node.value, name, context, attributes); break;
        }
        case 'text': atom(node, node.value, ['op', 'bin', 'rel'].includes(node.class) ? 'mo' : 'mtext', context,
          node.class === 'op' ? {form: 'prefix', movablelimits: String(node.limits === 'display')} : {}); break;
        case 'space': {
          const width = options.displayMode && node.displayWidth !== undefined ? node.displayWidth : node.width;
          open('mspace', {width: em(Math.max(0, width)), style: width < 0 ? 'margin-left:' + em(width) : undefined}); close('mspace'); break;
        }
        case 'scripts': scripts(node, context, depth); break;
        case 'frac': {
          const local = node.style ? styledContext(context, {mathStyle: node.style}) : context;
          if (node.style) open('mstyle', {displaystyle: String(local.display), scriptlevel: String(local.level)});
          if (node.left || node.right) { open('mrow'); fence(node.left, 'prefix', local); }
          open('mfrac', {linethickness: node.bar === false ? '0' : node.barThickness === undefined ? undefined : em(node.barThickness)});
          const child = local.display && local.level === 0 ? {...local, display: false} : scriptContext(local);
          emit(node.num, inner(child), depth + 1); emit(node.den, inner(child), depth + 1); close('mfrac');
          if (node.left || node.right) { fence(node.right, 'postfix', local); close('mrow'); }
          if (node.style) close('mstyle');
          if (node.align) warn('semantic-fraction-alignment', 'The fraction relationship is preserved; continued-fraction numerator alignment is left to the MathML host.');
          break;
        }
        case 'root':
          open(node.index ? 'mroot' : 'msqrt'); emit(node.body, inner(context), depth + 1);
          if (node.index) emit(node.index, {...inner(context), display: false, level: 2}, depth + 1);
          close(node.index ? 'mroot' : 'msqrt'); break;
        case 'fence':
          open('mrow'); fence(node.left, 'prefix', context, node.size); emit(node.body, inner(context), depth + 1); fence(node.right, 'postfix', context, node.size); close('mrow'); break;
        case 'enclose': {
          warn('semantic-overlay', 'An enclosure uses the MathML 3 menclose extension; hosts implementing only Core may omit its lines.');
          const css = (node.color ? 'color:' + node.color + ';' : '') + (node.background ? 'background:' + node.background + ';' : '');
          open('menclose', {notation: node.notation.join(' '), style: css || undefined}); emit(node.body, context, depth + 1); close('menclose'); break;
        }
        case 'accent': {
          if (node.overlay || node.position === 'through') {
            warn('semantic-overlay', 'An overlay uses the MathML 3 menclose extension; hosts implementing only Core may omit the cancellation or negation mark.');
            const notation = node.value === '╲' ? 'downdiagonalstrike' : node.value === '╳' ? 'updiagonalstrike downdiagonalstrike' : node.value === '↗' ? 'updiagonalarrow' : node.value === '─' ? 'horizontalstrike' : 'updiagonalstrike';
            open('menclose', {notation}); emit(node.base, context, depth + 1); close('menclose'); break;
          }
          const under = node.position === 'under', name = under ? 'munder' : 'mover';
          open(name, {[under ? 'accentunder' : 'accent']: 'true'}); emit(node.base, {...context, movableLimits: false}, depth + 1);
          token('mo', node.value, {stretchy: String(!!node.stretch)}, context); close(name); break;
        }
        case 'overunder': {
          const base = node.minWidth ? {...node.base, minWidth: node.minWidth} : node.base;
          if (!node.over && !node.under) { emit(base, {...context, ordinary: node.unspaced || undefined}, depth + 1); break; }
          const name = node.over && node.under ? 'munderover' : node.under ? 'munder' : 'mover';
          open(name, {accent: node.over ? 'false' : undefined, accentunder: node.under ? 'false' : undefined}); emit(base, {...context, movableLimits: false, ordinary: node.unspaced || undefined}, depth + 1);
          if (node.under) emit(node.under, scriptContext(context), depth + 1);
          if (node.over) emit(node.over, scriptContext(context), depth + 1);
          close(name); break;
        }
        case 'table': table(node, context, depth); break;
        case 'style': {
          const local = styledContext(context, node), attributes = {'data-math-class': node.class};
          if (node.mathStyle) { attributes.displaystyle = String(local.display); attributes.scriptlevel = String(local.level); }
          let css = '';
          if (node.absoluteSize !== undefined || node.size !== undefined) css += 'font-size:' + decimal(local.size / context.size) + 'em;';
          if (node.color) css += 'color:' + node.color + ';';
          if (node.background) css += 'background-color:' + node.background + ';';
          if (node.border) css += 'border:0.04em solid ' + node.border + ';padding:' + em(node.padding ?? .2) + ';';
          if (css) attributes.style = css;
          open('mstyle', attributes);
          if (node.tokenKind) {
            atom({variant: local.variant}, node.tokenText, node.tokenKind, local);
          } else if (node.operatorName) {
            const value = plain(node.body, depth + 1, true);
            if (value === null) {
              warn('semantic-rich-operator', 'A styled or mixed-math operator name retains its nested structure instead of becoming one plain operator token.');
              emit(node.body, local, depth + 1);
            } else atom({variant: 'roman'}, value, 'mo', local, {form: 'prefix', movablelimits: String(node.limits === 'display')});
          } else if (node.width !== undefined) {
            warn('semantic-layout-adjustment', 'A TeX layout adjustment retains its mathematical content with a bounded presentation approximation.');
            open('mpadded', {width: em(node.width)}); emit(node.body, local, depth + 1); close('mpadded');
          } else if (node.class) {
            const leaf = singleToken(node.body);
            if (leaf) emit({...leaf, class: node.class}, local, depth + 1);
            else if (node.body.type === 'row' && node.body.children.filter(child => child.type !== 'space').length === 1 &&
              node.body.children.every(child => child.type === 'space' || classOf(child) === node.class)) emit(node.body, local, depth + 1);
            else {
              warn('semantic-atom-class', 'A compound expression retains its mathematical children; its TeX atom class does not create a single MathML operator.');
              emit(node.body, local, depth + 1);
            }
          } else emit(node.body, local, depth + 1);
          close('mstyle'); break;
        }
        case 'phantom': {
          const before = content;
          if (node.mode === 'h' || node.mode === 'v') open('mpadded', node.mode === 'h' ? {height: '0', depth: '0'} : {width: '0'});
          open('mphantom'); emit(node.body, {...context, phantom: true}, depth + 1); close('mphantom');
          if (node.mode === 'h' || node.mode === 'v') close('mpadded');
          content = before; break;
        }
        case 'smash':
          open('mpadded', {height: node.mode === 'b' ? undefined : '0', depth: node.mode === 't' ? undefined : '0'});
          emit(node.body, context, depth + 1); close('mpadded'); break;
        case 'raise':
          open('mpadded', {voffset: node.center ? undefined : em(node.amount), height: node.height === undefined ? undefined : em(node.height), depth: node.depth === undefined ? undefined : em(node.depth)});
          emit(node.body, context, depth + 1); close('mpadded'); break;
        case 'rule':
          warn('semantic-rule-presentation', 'A rule is represented as a decorative mathematical space; no additional mathematical relationship is inferred.');
          open('mspace', {width: em(node.width), height: em(node.height), depth: em(node.depth), style: 'background-color:currentColor'}); close('mspace');
          if (!context.phantom && !context.transparent && node.width > 0 && node.height + node.depth > 0) content++; break;
        case 'link': {
          if (context.inLink) fail('semantic-nested-link', 'Nested authored mathematical links cannot be represented as valid native HTML links.');
          if (context.phantom) fail('semantic-hidden-link', 'An authored link inside phantom content cannot become an invisible native focus target.');
          let url;
          try { url = new URL(node.href); } catch { fail('unsafe-link', 'A mathematical link has an invalid address.'); }
          if (!['http:', 'https:'].includes(url.protocol) || !/^https?:\/\/[^\s<>"'\\]+$/i.test(node.href))
            fail('unsafe-link', 'A mathematical link must use an HTTP or HTTPS address.');
          warn('semantic-link-embedding', 'The authored link uses native HTML inside MathML text, with a nested MathML expression; assistive-technology interaction depends on the host.');
          metrics.links++;
          open('mtext'); open('a', {xmlns: 'http://www.w3.org/1999/xhtml', href: node.href, title: node.href, target: '_blank', rel: 'noopener noreferrer'});
          const before = content;
          open('math', {xmlns: MATH_ML_NAMESPACE, display: 'inline'}); emit(node.body, {...context, inLink: true, display: false}, depth + 1);
          if (content === before) fail('semantic-empty-link', 'An authored mathematical link has no visible content for native focus.');
          close('math'); close('a'); close('mtext'); break;
        }
        default: fail('unsupported-semantic-node', 'Unsupported mathematical node for MathML.');
      }
    } finally { active.delete(node); }
  }

  let status;
  try {
    if (sourceOmitted) fail('resource-limit', 'This formula is too long for MathML. Its source was not embedded; retain the original input.');
    if (options.error || safeSource?.error) throw options.error || safeSource.error;
    if (!tree) fail('unsupported-semantic-node', 'A parsed mathematical expression is required.');
    emit(tree, {display: !!options.displayMode, level: 0, size: 1, variant: 'normal', inLink: false});
    status = diagnostics.length ? 'presentation-fallback' : 'complete';
  } catch (cause) {
    const error = mathDiagnostic(cause);
    if (sourceOmitted) error.sourceOmitted = true;
    diagnostics.length = 0; diagnostics.push(error);
    status = 'refused'; metrics.links = 0;
    parts = ['<merror><mtext>Formula could not be represented as MathML.</mtext></merror>'];
  }
  const presentation = parts.join('');
  const annotation = sourceOmitted ? '' : encoding === 'application/x-tex' ?
    '<annotation encoding="application/x-tex">' + mathMLXML(source) + '</annotation>' :
    '<annotation encoding="text/plain">' + mathMLXML(safeSource.alternative) + '</annotation>' +
    '<annotation encoding="application/x-rapier-tex-utf16">' + utf16 + '</annotation>';
  const wrap = body => '<math xmlns="' + MATH_ML_NAMESPACE + '" display="' + (options.displayMode ? 'block' : 'inline') +
    '" data-rapier-mathml-status="' + status + '"' + (sourceOmitted ? ' data-math-source-omitted="true"' : '') +
    '><semantics>' + body + annotation + '</semantics></math>';
  // Source admission bounds escaping independently of the presentation budget:
  // at most 6M XML-escaped source, or 6M alternative plus 4M UTF-16 carrier.
  let mathml = wrap(presentation);
  if (mathml.length > 16 * 1024 * 1024) {
    status = 'refused'; metrics.links = 0;
    diagnostics.length = 0;
    diagnostics.push({code: 'resource-limit', offset: 0, message: 'Complete MathML exceeds its output budget.'});
    mathml = wrap('<merror><mtext>Formula could not be represented as MathML.</mtext></merror>');
  }
  metrics.outputCodeUnits = mathml.length;
  return {mathml, status, errors: diagnostics, metrics, source: sourceInfo};
}

// SPDX-License-Identifier: MIT
function mathSemanticPrepared(prepared, options = {}) {
  const {text, safe, tree, error} = prepared;
  return mathML(tree, text, safe, {displayMode: !!options?.displayMode, error});
}
function mathToMathML(source, options = {}) {
  return mathSemanticPrepared(mathPrepare(source), options);
}

// SPDX-License-Identifier: MIT
// The prepared tree never crosses the public boundary. Both outputs consume it
// within this call, before any result or caller-mutable parse tree is exposed.
function mathRenderWithMathML(source, options = {}) {
  const prepared = mathPrepare(source), displayMode = !!options?.displayMode;
  const semantics = mathSemanticPrepared(prepared, {displayMode});
  return {...mathRenderPrepared(prepared, {...options, displayMode}), semantics};
}

// SPDX-License-Identifier: MIT
globalThis.RapierMath=Object.freeze({
  version:'2.7.0', parse:parseMathTex,
  render:renderMath, renderToString:mathRenderToString,
  fit:mathFit, observe:mathObserve,
  toMathML:mathToMathML, renderWithMathML:mathRenderWithMathML,
});
})();
